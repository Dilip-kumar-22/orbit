// Indexed icosphere.
//
// three's IcosahedronGeometry is non-indexed: every triangle carries its own three vertices, so a
// shared corner is shipped and shaded about six times. The core's vertex shader evaluates two
// simplex-noise calls per vertex, so sharing vertices cuts that work ~6x for the same picture (the
// displacement depends only on a vertex's direction). Same subdivision as three: every face of the
// icosahedron becomes a triangular grid of (detail + 1)^2 triangles, projected onto the sphere.
// Pure maths (no three.js): unit-tested in tests/unit/geometry.test.js.

const T = (1 + Math.sqrt(5)) / 2;
const VERTS = [
  [-1, T, 0],
  [1, T, 0],
  [-1, -T, 0],
  [1, -T, 0],
  [0, -1, T],
  [0, 1, T],
  [0, -1, -T],
  [0, 1, -T],
  [T, 0, -1],
  [T, 0, 1],
  [-T, 0, -1],
  [-T, 0, 1],
];
// Counter-clockwise seen from outside.
const FACES = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

/**
 * @param {number} radius
 * @param {number} detail 0 = the plain icosahedron; each step adds one subdivision per edge
 * @returns {{ positions: Float32Array, normals: Float32Array, indices: Uint16Array | Uint32Array,
 *   vertexCount: number, triangleCount: number }}
 */
export function createIcosphere(radius = 1, detail = 0) {
  const n = Math.max(0, Math.floor(detail)) + 1; // segments along each base edge
  const vertexCount = 10 * n * n + 2;
  const triangleCount = 20 * n * n;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new (vertexCount > 65535 ? Uint32Array : Uint16Array)(triangleCount * 3);

  let next = 0;
  const corners = new Map(); // base vertex -> id
  const edges = new Map(); // base edge + step along it -> id

  const create = (x, y, z) => {
    const len = Math.hypot(x, y, z);
    const k = next * 3;
    normals[k] = x / len;
    normals[k + 1] = y / len;
    normals[k + 2] = z / len;
    positions[k] = (x / len) * radius;
    positions[k + 1] = (y / len) * radius;
    positions[k + 2] = (z / len) * radius;
    return next++;
  };
  const shared = (map, key, x, y, z) => {
    let id = map.get(key);
    if (id === undefined) map.set(key, (id = create(x, y, z)));
    return id;
  };

  let t = 0;
  for (const [ia, ib, ic] of FACES) {
    const [ax, ay, az] = VERTS[ia];
    const [bx, by, bz] = VERTS[ib];
    const [cx, cy, cz] = VERTS[ic];
    // Grid point (i, j) has barycentric weights (n - i - j, j, i) on (a, b, c).
    const ids = [];
    for (let i = 0; i <= n; i += 1) {
      ids[i] = [];
      for (let j = 0; j <= n - i; j += 1) {
        const wa = n - i - j;
        const x = wa * ax + j * bx + i * cx;
        const y = wa * ay + j * by + i * cy;
        const z = wa * az + j * bz + i * cz;
        let id;
        if (wa === n) id = shared(corners, ia, x, y, z);
        else if (j === n) id = shared(corners, ib, x, y, z);
        else if (i === n) id = shared(corners, ic, x, y, z);
        else if (i === 0 || j === 0 || wa === 0) {
          // On a base edge: identify it by its two end vertices and the distance from the lower one.
          const [from, to, step] = i === 0 ? [ia, ib, j] : j === 0 ? [ia, ic, i] : [ib, ic, i];
          const lo = Math.min(from, to);
          const hi = Math.max(from, to);
          const key = (lo * 12 + hi) * (n + 1) + (from === lo ? step : n - step);
          id = shared(edges, key, x, y, z);
        } else id = create(x, y, z); // interior: belongs to this face alone
        ids[i][j] = id;
      }
    }
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n - i; j += 1) {
        indices[t++] = ids[i][j];
        indices[t++] = ids[i][j + 1];
        indices[t++] = ids[i + 1][j];
        if (j < n - i - 1) {
          indices[t++] = ids[i][j + 1];
          indices[t++] = ids[i + 1][j + 1];
          indices[t++] = ids[i + 1][j];
        }
      }
    }
  }
  return { positions, normals, indices, vertexCount, triangleCount };
}
