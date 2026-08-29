// Decoder for PGN 130824 "B&G: key-value data" (Manufacturer 381 = B&G).
//
// canboatjs does not yet decode this PGN's dynamic key/value list (see canboatjs
// PR #446), so we decode it here: reassemble the fast-packet, walk the TLV
// (12-bit key / 4-bit length / value), and scale each value from the
// BANDG_KEY_VALUE catalog shipped in @canboat/pgns (resolution + unit + bits).
//
// Multiple B&G devices broadcast this PGN with different key subsets (the CPU
// sends performance data; the Motion Sensor sends attitude; the Sail Pilot sends
// pilot data), all in one global key namespace, so decoding is purely key-driven
// and per-source (the caller tags points by source).
//
// Hardening rules learned from live H5000 data (validated against the CPU admin UI):
//   * Manufacturer guard: only decode frames whose header manufacturer code is 381
//     (B&G). Maretron (137) and Mercury (144) also use 130824 with a different layout.
//   * Bit-length guard: only scale a key when the catalog's bit length matches the
//     length on the wire. Some keys are miscatalogued as 16-bit but sent 32-bit
//     (e.g. Roll Rate, Pitch Angle) — scaling those would produce garbage, so skip
//     them until @canboat/pgns is fixed.
//   * Signedness: use canboat's Signed flag, but force compass DIRECTIONS unsigned —
//     they are marked signed in the catalog but the H5000 sends them as 0..2π
//     unsigned (otherwise headings > 180° decode negative). Precomputed below.
//   * Resolution overrides: the Trip Time keys are catalogued at 0.001 s but are
//     actually 0.0001 s (a 10x error; verified against the CPU's own Trip 2 Time).
//
// Unknown keys (not in the catalog) are collected in `unknownKeys` for later
// identification and are otherwise skipped.
import pgns from "@canboat/pgns";

const BANDG_MFG = 381;

type KeyMeta = { name: string; res: number | null; unit?: string; bits: number };
const CATALOG: Record<number, KeyMeta> = {};
{
  const en = (pgns as any).LookupFieldTypeEnumerations?.find(
    (x: any) => x.Name === "BANDG_KEY_VALUE"
  );
  if (en)
    for (const v of en.EnumFieldTypeValues)
      CATALOG[+v.value] = {
        name: v.name,
        res: v.Resolution != null ? parseFloat(v.Resolution) : null,
        unit: v.Unit,
        bits: +v.Bits,
      };
}

// Keys present in the canboat GitHub source (174 keys) but missing from every
// published @canboat/pgns (154 keys, checked 3.2.0 and 6.0.2). Bumping the dep
// does not add them, so bundle them here. Remove once @canboat/pgns ships them.
const EXTRA_CATALOG: Record<number, KeyMeta> = {
  208: { name: "Trip 2 Distance", res: 0.01, unit: "m", bits: 32 },
  266: { name: "Trip 1 Speed Max", res: 0.01, unit: "m/s", bits: 16 },
  267: { name: "Trip 2 Time", res: 0.001, unit: "s", bits: 32 }, // res corrected via RES_OVERRIDE
  268: { name: "Trip 2 Speed Max", res: 0.01, unit: "m/s", bits: 16 },
  269: { name: "Trip 2 Speed Avg", res: 0.01, unit: "m/s", bits: 16 },
};
for (const [k, v] of Object.entries(EXTRA_CATALOG))
  if (!CATALOG[+k]) CATALOG[+k] = v;

// canboat's Signed flag AND not a compass direction (@canboat/pgns omits Signed,
// so this is precomputed from the canboat definitions). See header note.
const SIGNED_KEYS = new Set<number>([0, 11, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 50, 52, 53, 56, 57, 58, 59, 60, 68, 81, 83, 102, 103, 104, 111, 117, 124, 125, 130, 132, 152, 155, 156, 157, 158, 263, 264, 270, 271, 273, 276, 277, 278, 279, 280, 281, 285, 291, 296, 297, 299, 300, 301, 302, 308, 310, 312, 313, 314, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 337, 338, 364, 365, 380, 381, 382, 383, 385, 386, 387, 409, 410, 411, 412]);

// Confirmed catalog resolution errors (report upstream to ts-pgns).
const RES_OVERRIDE: Record<number, number> = { 265: 0.0001, 267: 0.0001 };

/**
 * Decodes PGN 130824 from a single CAN interface. Instantiate one per CANInput:
 * fast-packet reassembly state is keyed by source address, and source addresses
 * can repeat across buses, so the state must not be shared between interfaces.
 */
export class BandGKeyValueDecoder {
  private readonly pending: Record<
    number,
    { total: number; buf: Buffer; seq: number; next: number }
  > = {};

  /** Keys seen on the wire that are not in the catalog — candidates to identify. */
  readonly unknownKeys = new Set<number>();

  /**
   * Feed one raw CAN frame's data for a 130824 message from `src`. Returns the
   * decoded, scaled fields when the fast-packet completes, otherwise null.
   */
  feed(src: number, data: Buffer): Record<string, number> | null {
    const seq = data[0] >> 5;
    const frame = data[0] & 0x1f;
    if (frame === 0) {
      this.pending[src] = {
        total: data[1],
        buf: Buffer.from(data.subarray(2)),
        seq,
        next: 1,
      };
    } else {
      const st = this.pending[src];
      // Require the same sequence AND the expected next frame counter. A repeated
      // or out-of-order frame would otherwise be appended at the wrong offset and
      // could make buf reach `total` with corrupt data; discard the assembly.
      if (!st || st.seq !== seq || st.next !== frame) {
        delete this.pending[src];
        return null;
      }
      st.buf = Buffer.concat([st.buf, data.subarray(1)]);
      st.next++;
    }
    const st = this.pending[src];
    if (st && st.buf.length >= st.total) {
      const payload = st.buf.subarray(0, st.total);
      delete this.pending[src];
      return this.decode(payload);
    }
    return null;
  }

  private decode(payload: Buffer): Record<string, number> | null {
    if (payload.length < 2) return null;
    const mfg = (payload[0] | (payload[1] << 8)) & 0x7ff;
    if (mfg !== BANDG_MFG) return null;

    const out: Record<string, number> = {};
    let i = 2; // skip 2-byte manufacturer/industry header
    while (i + 2 <= payload.length) {
      const hdr = payload[i] | (payload[i + 1] << 8);
      const key = hdr & 0x0fff;
      const len = (hdr >> 12) & 0x0f;
      i += 2;
      if (i + len > payload.length) break;
      let raw = 0;
      for (let b = 0; b < len; b++) raw += payload[i + b] * 2 ** (8 * b);
      i += len;

      const m = CATALOG[key];
      if (!m) {
        this.unknownKeys.add(key);
        continue;
      }
      if (m.res == null || m.bits !== len * 8) continue; // unscalable / miscatalogued length

      const bits = len * 8;
      const signed = SIGNED_KEYS.has(key);
      // Skip NMEA2000 reserved encodings so an unavailable sensor value is not
      // scaled into real telemetry: the top value of the field's range is
      // "not available", the next is "out of range". Sentinels differ by
      // signedness (0xFFFF/0xFFFE unsigned, 0x7FFF/0x7FFE signed for 16-bit).
      const naValue = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
      if (raw === naValue || raw === naValue - 1) continue;

      let v = raw;
      if (signed && v >= 2 ** (bits - 1)) v -= 2 ** bits;
      v *= RES_OVERRIDE[key] ?? m.res;

      // Emit raw SI (rad, m/s, deg for lat/lon, %, s, m) under the catalog key
      // name, matching the rest of the nmea measurement (which is likewise raw SI
      // - canboatjs field units are not applied). Conversion to display units and
      // renaming happen downstream in mapping.csv (factor).
      if (typeof v === "number" && !Number.isNaN(v)) out[m.name] = v;
    }
    return Object.keys(out).length ? out : null;
  }
}
