// Mapa 3D da cidade (só para olhar). Usa three.js e desenha tudo com poucas peças repetidas (InstancedMesh):
// o custo fica baixo mesmo com centenas de prédios, e a tela só é redesenhada quando algo muda ou você mexe na câmera.
(function (root) {
  'use strict';
  const GRASS = 0x5d9c4a, ROAD = 0x39424f;
  const hash = n => { let x = Math.imul(n + 1, 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; return (x ^ (x >>> 13)) >>> 0; };

  // Posição de cada terreno: espiral quadrada a partir do centro, a cidade cresce igualmente para todos os lados
  const spiralCache = [[0, 0]];
  function spiral(n) {
    while (spiralCache.length <= n) {
      const i = spiralCache.length;
      // recomeça do último ponto: reconstrói incrementalmente seguindo o mesmo padrão
      let x = 0, z = 0, dx = 1, dz = 0, seg = 1, segPassed = 0, passed = 0;
      if (i > 1) { const st = spiralCache.state; ({x, z, dx, dz, seg, segPassed, passed} = st); }
      x += dx; z += dz; segPassed++;
      if (segPassed === seg) { segPassed = 0; const t = dx; dx = -dz; dz = t; passed++; if (passed % 2 === 0) seg++; }
      spiralCache.state = {x, z, dx, dz, seg, segPassed, passed};
      spiralCache.push([x, z]);
    }
    return spiralCache[n];
  }

  // ---------- Peças: [tipo, x, y, z, tamanhoX, tamanhoY, tamanhoZ, cor, giroY, giroZ] ----------
  // b = caixa, c = cilindro (diâmetro = tamanhoX), r = telhado em pirâmide, t = cone (árvore)
  const B = (x, y, z, sx, sy, sz, c, ry, rz) => ['b', x, y, z, sx, sy, sz, c, ry || 0, rz || 0];
  const C = (x, y, z, d, h, c) => ['c', x, y, z, d, h, d, c, 0, 0];
  const R = (x, y, z, sx, sy, sz, c) => ['r', x, y, z, sx, sy, sz, c, Math.PI / 4, 0];
  const T = (x, y, z, d, h, c) => ['t', x, y, z, d, h, d, c, 0, 0];
  const WALLS = [0xf1e4c3, 0xe9c9a0, 0xd9e3ea, 0xf2d4d0];
  const ROOFS = [0xb5533c, 0x8a4b3a, 0x6b5b95, 0x9a6b3d];

  function floors(parts, w, d, n, y0, fh, glass) {
    for (let i = 0; i < n; i++) parts.push(B(0, y0 + i * fh + fh * 0.45, 0, w + 0.012, fh * 0.28, d + 0.012, glass));
  }
  function trees(parts, list, h) {
    list.forEach(([x, z, s]) => { parts.push(B(x, 0, z, 0.04, 0.1 * (h || 1), 0.04, 0x6b4a2b)); parts.push(T(x, 0.08 * (h || 1), z, 0.2 * s, 0.34 * s * (h || 1), 0x2f7d3a)); });
  }

  const BUILD = {
    prefeitura: () => [B(0, 0, 0, 0.74, 0.34, 0.5, 0xe8e2d0), B(0, 0.34, 0, 0.6, 0.06, 0.4, 0xc9a24a), B(-0.2, 0, 0.26, 0.05, 0.3, 0.05, 0xffffff), B(0.2, 0, 0.26, 0.05, 0.3, 0.05, 0xffffff), B(0, 0.4, 0, 0.2, 0.44, 0.2, 0xe8e2d0), R(0, 0.84, 0, 0.26, 0.2, 0.26, 0xc9a24a), B(0.05, 1.04, 0, 0.02, 0.2, 0.02, 0xdddddd), B(0.12, 1.14, 0, 0.14, 0.08, 0.01, 0xd33f3f)],
    casa: (lv, h) => {
      const w = WALLS[h % 4], r = ROOFS[(h >>> 3) % 4];
      if (lv === 1) return [B(0, 0, 0, 0.5, 0.3, 0.44, w), R(0, 0.3, 0, 0.58, 0.24, 0.5, r), B(0.12, 0, 0.23, 0.1, 0.18, 0.02, 0x7a5236)];
      if (lv === 2) return [B(0, 0, 0, 0.56, 0.58, 0.5, w), R(0, 0.58, 0, 0.64, 0.26, 0.56, r), B(0.34, 0, 0.0, 0.16, 0.22, 0.3, 0xd7d7d7), B(-0.08, 0.2, 0.26, 0.12, 0.12, 0.02, 0x6fa8dc), B(0.12, 0.2, 0.26, 0.12, 0.12, 0.02, 0x6fa8dc)];
      return [B(0, 0, 0, 0.62, 0.62, 0.5, w), R(0, 0.62, 0, 0.7, 0.28, 0.56, r), B(-0.42, 0, 0, 0.26, 0.42, 0.42, w), R(-0.42, 0.42, 0, 0.32, 0.2, 0.48, r), B(0.42, 0, 0, 0.26, 0.42, 0.42, w), R(0.42, 0.42, 0, 0.32, 0.2, 0.48, r),
        B(0, 0, 0.42, 0.5, 0.025, 0.2, 0x5ab4e6), B(-0.12, 0.3, 0.26, 0.12, 0.14, 0.02, 0x6fa8dc), B(0.12, 0.3, 0.26, 0.12, 0.14, 0.02, 0x6fa8dc)];
    },
    predio: (lv, h) => {
      const n = [4, 7, 12][lv - 1], fh = 0.2, w = [0.56, 0.58, 0.6][lv - 1], col = lv === 3 ? 0x9fc4e0 : [0xc9b79c, 0xb9c3d1][lv - 1] || 0xb9c3d1, p = [B(0, 0, 0, w, n * fh, w * 0.9, col)];
      floors(p, w, w * 0.9, n, 0.02, fh, lv === 3 ? 0x2a4a73 : 0x56667d);
      p.push(B(0, n * fh, 0, w * 0.6, 0.06, w * 0.5, 0x777777));
      if (lv === 3) p.push(B(0, n * fh + 0.06, 0, 0.03, 0.4, 0.03, 0xdddddd));
      return p;
    },
    condominio: (lv) => {
      const p = [B(-0.18, 0, 0, 0.34, 0.5 + 0.2 * (lv - 1), 0.5, 0xe8dcc8), B(0.2, 0, 0, 0.3, 0.38 + 0.2 * (lv - 1), 0.5, 0xd9c7a8), B(0, 0, 0.36, 0.7, 0.02, 0.2, 0x5ab4e6)];
      floors(p, 0.34, 0.5, 2 + lv, 0.04, 0.16, 0x4a6a8a);
      trees(p, [[-0.4, 0.4, 1], [0.4, 0.4, 1]]);
      if (lv >= 3) p.push(B(0, 0.7, 0, 0.5, 0.05, 0.4, 0xc9a24a));
      return p;
    },
    loja: (lv, h) => {
      const col = [0xf4b942, 0x63b3ed, 0xed8b8b, 0xa78bfa][h % 4], p = [B(0, 0, 0, 0.7, 0.28 + 0.18 * (lv - 1), 0.52, 0xece7dd), B(0, 0.2, 0.28, 0.7, 0.07, 0.12, col), B(0, 0.06, 0.27, 0.5, 0.12, 0.02, 0x6fa8dc)];
      if (lv >= 2) p.push(B(0.0, 0.28 + 0.18 * (lv - 1), 0, 0.62, 0.05, 0.44, 0x777777));
      if (lv >= 3) p.push(B(0, 0.46, 0, 0.62, 0.22, 0.46, 0x9ad0f0));
      return p;
    },
    mercado: (lv) => [B(0, 0, 0, 0.84, 0.3 + 0.12 * (lv - 1), 0.62, 0xdad4c6), B(0, 0.24, 0.32, 0.84, 0.08, 0.1, 0xd9453d), B(0, 0.34, 0.1, 0.5, 0.22 + 0.15 * lv, 0.04, 0xf4b942), B(0, -0.0, 0.46, 0.84, 0.012, 0.2, 0x555b66), ...(lv >= 3 ? [B(0, 0.42, 0, 0.7, 0.18, 0.5, 0x9ad0f0)] : [])],
    fazenda: (lv) => {
      const p = [B(0, -0.0, 0, 0.9, 0.02, 0.9, 0xcfa95b)];
      for (let i = -3; i <= 3; i++) p.push(B(-0.18, 0.02, i * 0.12, 0.5, 0.05, 0.05, 0x5fae3f));
      p.push(B(0.3, 0, -0.2, 0.28, 0.2, 0.32, 0xb23a2e), R(0.3, 0.2, -0.2, 0.32, 0.14, 0.36, 0x7a2a22));
      if (lv >= 2) p.push(C(0.34, 0, 0.2, 0.12, 0.34, 0xcfd3d8), T(0.34, 0.34, 0.2, 0.12, 0.07, 0x99a0a8));
      if (lv >= 3) p.push(C(0.12, 0, 0.3, 0.12, 0.4, 0xcfd3d8), B(-0.3, 0.07, 0.3, 0.3, 0.1, 0.14, 0xe0e0e0));
      return p;
    },
    fabrica: (lv) => {
      const p = [B(0, 0, 0, 0.74 + 0.04 * lv, 0.3 + 0.1 * (lv - 1), 0.5, 0x8b94a3), B(-0.15, 0.3 + 0.1 * (lv - 1), 0, 0.16, 0.08, 0.5, 0x6d7685), B(0.1, 0.3 + 0.1 * (lv - 1), 0, 0.16, 0.08, 0.5, 0x6d7685), C(0.3, 0, -0.16, 0.1, 0.5 + 0.2 * lv, 0x7b4a3a)];
      if (lv >= 2) p.push(C(0.18, 0, -0.16, 0.1, 0.4 + 0.2 * lv, 0x7b4a3a), B(-0.1, 0, 0.34, 0.5, 0.18, 0.18, 0xa5adbb));
      if (lv >= 3) p.push(C(-0.3, 0, -0.16, 0.2, 0.55, 0xcfd3d8), B(0.0, 0, -0.38, 0.8, 0.2, 0.16, 0x6d7685));
      return p;
    },
    tecnologia: (lv) => {
      const p = [B(0, 0, 0, 0.5, 0.5 + 0.2 * lv, 0.46, 0x4f8fc0), B(0.0, 0.5 + 0.2 * lv, 0, 0.34, 0.2, 0.3, 0x6fb1e0), B(0.0, 0, 0.0, 0.52, 0.04, 0.48, 0x2d4a66)];
      floors(p, 0.5, 0.46, 2 + lv, 0.04, 0.2, 0x234a73);
      if (lv >= 3) p.push(B(0.0, 0.9, 0, 0.03, 0.4, 0.03, 0xdddddd));
      return p;
    },
    escola: (lv) => {
      const p = [B(0, 0, 0, 0.7, 0.3, 0.34, 0xf0d58c), B(0, 0.3, 0, 0.74, 0.05, 0.38, 0xc0603a), B(-0.2, 0, 0.3, 0.3, 0.3, 0.2, 0xf0d58c), R(-0.2, 0.3, 0.3, 0.34, 0.15, 0.24, 0xc0603a), B(0.34, 0, 0.3, 0.02, 0.5, 0.02, 0xdddddd), B(0.4, 0.44, 0.3, 0.1, 0.06, 0.01, 0x3d85c6)];
      if (lv >= 2) p.push(B(0.2, 0.3, 0, 0.3, 0.2, 0.3, 0xf0d58c));
      if (lv >= 3) p.push(B(-0.2, 0.3, 0, 0.3, 0.3, 0.3, 0xf0d58c), B(0.0, 0, -0.38, 0.7, 0.16, 0.16, 0xe6c876));
      return p;
    },
    universidade: (lv) => {
      const p = [B(0, 0, 0, 0.84, 0.34, 0.5, 0xe3d6b8), B(0, 0.34, 0, 0.88, 0.04, 0.54, 0xa39a82), C(0, 0.38, 0, 0.3, 0.14, 0xe3d6b8), T(0, 0.52, 0, 0.3, 0.18, 0x3d85c6)];
      for (let i = -2; i <= 2; i++) p.push(B(i * 0.16, 0, 0.28, 0.04, 0.3, 0.04, 0xffffff));
      if (lv >= 2) p.push(B(-0.46, 0, 0, 0.26, 0.4, 0.42, 0xe3d6b8));
      if (lv >= 3) p.push(B(0.46, 0, 0, 0.26, 0.5, 0.42, 0xe3d6b8), B(0, 0, -0.4, 0.8, 0.2, 0.16, 0xd2c6a6));
      return p;
    },
    hospital: (lv) => {
      const hh = 0.4 + 0.22 * (lv - 1), p = [B(0, 0, 0, 0.7, hh, 0.5, 0xf4f6f8), B(0.0, hh, 0.0, 0.5, 0.02, 0.1, 0xe03b3b), B(0.0, hh, 0.0, 0.1, 0.02, 0.5, 0xe03b3b), B(0, 0.06, 0.26, 0.28, 0.16, 0.02, 0x6fa8dc)];
      floors(p, 0.7, 0.5, Math.round(hh / 0.2), 0.04, 0.2, 0x8ea6bd);
      if (lv >= 2) p.push(B(0.44, 0, 0, 0.24, hh * 0.7, 0.4, 0xe4e8ec));
      if (lv >= 3) p.push(B(-0.44, 0, 0, 0.24, hh * 0.7, 0.4, 0xe4e8ec), C(0.0, hh + 0.02, 0, 0.3, 0.02, 0xdddddd));
      return p;
    },
    policia: (lv) => {
      const p = [B(0, 0, 0, 0.6, 0.3 + 0.1 * (lv - 1), 0.46, 0x4a6fa5), B(0, 0.3 + 0.1 * (lv - 1), 0, 0.64, 0.05, 0.5, 0x2e4a73), B(0.22, 0.35, 0.0, 0.1, 0.2, 0.1, 0x2e4a73), B(0.22, 0.55, 0.0, 0.08, 0.05, 0.08, 0xe04b4b), B(-0.12, 0.06, 0.24, 0.22, 0.14, 0.02, 0xdbe7f5)];
      if (lv >= 2) p.push(B(-0.38, 0, 0, 0.22, 0.26, 0.36, 0x4a6fa5));
      if (lv >= 3) p.push(B(0.38, 0, 0, 0.22, 0.34, 0.36, 0x4a6fa5), B(0, 0, 0.42, 0.7, 0.02, 0.1, 0x555b66));
      return p;
    },
    bombeiros: (lv) => {
      const p = [B(0, 0, 0, 0.66, 0.3 + 0.08 * (lv - 1), 0.46, 0xcc3b32), B(-0.15, 0, 0.24, 0.18, 0.2, 0.02, 0x3a3a3a), B(0.15, 0, 0.24, 0.18, 0.2, 0.02, 0x3a3a3a), B(0.3, 0, -0.1, 0.12, 0.62 + 0.15 * lv, 0.12, 0xa42f28), B(0.3, 0.62 + 0.15 * lv, -0.1, 0.16, 0.05, 0.16, 0x7a2a22)];
      if (lv >= 2) p.push(B(-0.42, 0, 0, 0.22, 0.26, 0.4, 0xcc3b32));
      if (lv >= 3) p.push(B(0, 0.38, 0, 0.5, 0.1, 0.3, 0xe14b42));
      return p;
    },
    parque: (lv) => {
      const p = [B(0.18, 0.0, 0.2, 0.34, 0.02, 0.28, 0x5ab4e6), B(-0.3, 0, -0.3, 0.3, 0.015, 0.05, 0xd8c79a)];
      trees(p, [[-0.3, 0.1, 1.3], [-0.1, -0.3, 1.1], [0.3, -0.25, 1.2], [-0.36, 0.34, 1]].slice(0, 2 + lv));
      if (lv >= 2) p.push(B(0.0, 0, 0, 0.05, 0.14, 0.05, 0xd8c79a), B(0.0, 0.14, 0, 0.18, 0.04, 0.18, 0xe8d4a4));
      if (lv >= 3) trees(p, [[0.42, 0.42, 1.3], [-0.42, 0.0, 1.4]]);
      return p;
    },
    estadio: (lv) => [B(0, 0, 0, 0.9, 0.32 + 0.1 * (lv - 1), 0.66, 0xd9d9d9), B(0, 0.3 + 0.1 * (lv - 1), 0, 0.5, 0.012, 0.3, 0x4fae45), B(0, 0.28 + 0.1 * (lv - 1), -0.34, 0.9, 0.12, 0.05, 0xb0b0b0), B(0, 0.28 + 0.1 * (lv - 1), 0.34, 0.9, 0.12, 0.05, 0xb0b0b0), ...(lv >= 3 ? [B(-0.44, 0.4, 0, 0.03, 0.4, 0.03, 0xdddddd), B(0.44, 0.4, 0, 0.03, 0.4, 0.03, 0xdddddd)] : [])],
    agua: (lv) => [C(0, 0.22, 0, 0.42 + 0.06 * lv, 0.3 + 0.1 * lv, 0x7fb6dd), B(-0.12, 0, -0.12, 0.04, 0.22, 0.04, 0x8a8f98), B(0.12, 0, -0.12, 0.04, 0.22, 0.04, 0x8a8f98), B(-0.12, 0, 0.12, 0.04, 0.22, 0.04, 0x8a8f98), B(0.12, 0, 0.12, 0.04, 0.22, 0.04, 0x8a8f98), ...(lv >= 3 ? [C(0.36, 0, 0.3, 0.2, 0.3, 0xcfe3f4)] : [])],
    esgoto: (lv) => { const p = [C(-0.18, 0, 0, 0.4, 0.1, 0x8a7a5a), C(0.2, 0, 0.1, 0.34, 0.14, 0x6f8a5a), B(0.0, 0, -0.34, 0.7, 0.14, 0.14, 0xa0a6ad)]; if (lv >= 2) p.push(C(0.2, 0, -0.1, 0.2, 0.2, 0x6f8a5a)); if (lv >= 3) p.push(C(-0.3, 0, 0.3, 0.26, 0.18, 0x8a7a5a)); return p; },
    solar: (lv) => { const p = []; for (let i = 0; i < 2 + lv; i++) { const z = -0.32 + i * (0.64 / (1 + lv)); p.push(B(0, 0.1, z, 0.7, 0.03, 0.16, 0x1e3a6e), B(0, 0.0, z, 0.04, 0.1, 0.04, 0x888888)); } return p; },
    eolica: (lv) => {
      const hgt = 0.7 + 0.2 * lv, p = [C(0, 0, 0, 0.07, hgt, 0xf1f1f1), B(0, hgt - 0.03, 0.04, 0.08, 0.08, 0.14, 0xdedede)];
      if (lv >= 3) p.push(C(0.34, 0, 0.3, 0.05, 0.6, 0xf1f1f1));
      return p;
    },
    carvao: (lv) => [B(0, 0, 0, 0.7, 0.28, 0.4, 0x4a4a52), C(-0.2, 0, -0.2, 0.26 + 0.04 * lv, 0.5 + 0.12 * lv, 0x6c6c75), C(0.18, 0, -0.2, 0.26 + 0.04 * lv, 0.5 + 0.12 * lv, 0x6c6c75), B(0.0, 0, 0.3, 0.7, 0.05, 0.18, 0x222222), ...(lv >= 3 ? [C(0.36, 0, 0.1, 0.2, 0.8, 0x4a4a52)] : [])],
    filtro: (lv) => [B(0, 0, 0, 0.4, 0.2, 0.4, 0x8aa0b3), C(0.0, 0.2, 0, 0.18, 0.5 + 0.1 * lv, 0xb5c7d6), C(-0.26, 0, 0.2, 0.14, 0.34, 0x9fb4c5), ...(lv >= 2 ? [C(0.26, 0, 0.2, 0.14, 0.4, 0x9fb4c5)] : []), ...(lv >= 3 ? [B(0, 0, -0.34, 0.6, 0.12, 0.14, 0x8aa0b3)] : [])],
    floresta: (lv) => { const p = []; trees(p, [[-0.28, -0.25, 1.5], [0.2, -0.3, 1.2], [0.0, 0.0, 1.7], [-0.3, 0.25, 1.3], [0.3, 0.2, 1.5], [0.1, 0.4, 1.1], [-0.05, -0.4, 1.0]].slice(0, 4 + lv * 1), 1.2); return p; },
    reciclagem: (lv) => [B(0, 0, 0, 0.7, 0.26 + 0.1 * (lv - 1), 0.46, 0x6fbf73), B(0.0, 0.26 + 0.1 * (lv - 1), 0, 0.74, 0.04, 0.5, 0x3f8f50), B(-0.3, 0, 0.32, 0.2, 0.14, 0.14, 0x3f8f50), B(0.25, 0, 0.32, 0.3, 0.06, 0.14, 0x555b66), C(0.28, 0, -0.3, 0.1, 0.4, 0x4a8a58)],
  };

  // ---------- Cena ----------
  let renderer, scene, camera, host = null, raf = 0, dirty = true, sig = '', state = null, ro = null, boundTo = null;
  const view = {yaw: 0.8, pitch: 0.75, dist: 9, tx: 0, tz: 0, auto: true};
  let meshes = [], ground = null;
  let geoms = null, hemi = null, sunL = null, focusNow = 'capital', skyAt = 0;

  function ensure() {
    const T = root.THREE;
    if (renderer) return true;
    if (!T) return false;
    try {
      renderer = new T.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'low-power'});
    } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.75));
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(40, 1, 0.1, 400);
    hemi = new T.HemisphereLight(0xdfeaff, 0x4f5f3e, 0.85); scene.add(hemi);
    sunL = new T.DirectionalLight(0xfff0d0, 0.95); sunL.position.set(-6, 11, 5); scene.add(sunL);
    const box = new T.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const cyl = new T.CylinderGeometry(0.5, 0.5, 1, 14); cyl.translate(0, 0.5, 0);
    const pyr = new T.ConeGeometry(0.7071, 1, 4); pyr.translate(0, 0.5, 0);
    const cone = new T.ConeGeometry(0.5, 1, 7); cone.translate(0, 0.5, 0);
    geoms = {b: box, c: cyl, r: pyr, t: cone};
    return true;
  }

  function mount() {
    const el = document.getElementById('map3d');
    if (!el) return false;
    if (!ensure()) { el.innerHTML = '<div style="padding:30px;text-align:center;color:#8ea0b8">O mapa 3D não abriu neste aparelho.</div>'; return false; }
    if (host !== el) {
      host = el; el.appendChild(renderer.domElement); bind(el);
      if (ro) ro.disconnect();
      if (root.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(el); }
      resize(); dirty = true;
    }
    return true;
  }
  function resize() {
    if (!host || !renderer) return;
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (!view.touched && view.span) view.dist = fitDist(); dirty = true; schedule();
  }

  // ---------- Montagem da cidade ----------
  const PITCH = 1.3, SCALE = 0.8;                       // distância entre terrenos (o vão vira rua) e tamanho dos prédios
  let cars = [], walkers = [], smoke = [], turbines = [], boats = [], dyn = [], clouds = null, cloudData = [], lay = null, mode = 'city', clock = 0;
  const CAR_COLORS = [0xd9453d, 0x3d85c6, 0xf4b942, 0xf1f1f1, 0x2f2f35, 0x4fae45, 0xa78bfa, 0xff8a3d];
  const SKIN = [0xf1c9a5, 0xd9a577, 0x8d5a3b, 0xf4d9bd], CLOTHES = [0xd9453d, 0x3d85c6, 0xf4b942, 0xffffff, 0x4fae45, 0xa78bfa, 0x2f2f35];
  const M4 = () => new (root.THREE.Matrix4)(), V3 = () => new (root.THREE.Vector3)();
  let tmp = null;
  const T_ = () => tmp || (tmp = {m4: M4(), q: new root.THREE.Quaternion(), e: new root.THREE.Euler(), v: V3(), sc: V3(), col: new root.THREE.Color()});

  function disposeMesh(m) { scene.remove(m); if (m.material) m.material.dispose(); if (m.dispose) m.dispose(); }
  function clearScene() {
    meshes.forEach(disposeMesh); meshes = []; dyn.forEach(disposeMesh); dyn = []; if (clouds) { disposeMesh(clouds); clouds = null; }
    if (ground) { scene.remove(ground); ground.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); }); ground = null; }
    cars = []; walkers = []; smoke = []; turbines = []; boats = [];
  }
  function makeInst(geo, list, mat) {
    if (!list.length) return null;
    const T = root.THREE, k = T_(), mesh = new T.InstancedMesh(geo, mat || new T.MeshLambertMaterial({color: 0xffffff}), list.length);
    list.forEach((it, n) => {
      k.e.set(0, it[7], it[8], 'YXZ'); k.q.setFromEuler(k.e); k.v.set(it[0], it[1], it[2]); k.sc.set(it[3], it[4], it[5]);
      k.m4.compose(k.v, k.q, k.sc); mesh.setMatrixAt(n, k.m4); if (it[6] != null) mesh.setColorAt(n, k.col.setHex(it[6]));
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh); return mesh;
  }
  // peças dos prédios de um terreno; devolve as chaminés e turbinas para animar
  function emit(items, k, lv, h, px, pz, scale, y0) {
    if (!BUILD[k]) return;
    const parts = BUILD[k](lv, h);
    parts.forEach(([type, x, y, z, sx, sy, sz, col, rot, rz]) => items[type].push([px + x * scale, y0 + y * scale, pz + z * scale, sx * scale, sy * scale, sz * scale, col, rot, rz]));
    if (k === 'eolica') { const hgt = 0.7 + 0.2 * lv; turbines.push({x: px, y: y0 + (hgt + 0.01) * scale, z: pz + 0.12 * scale, len: (0.3 + 0.05 * lv) * scale, ph: h % 6}); }
    if (k === 'fabrica' || k === 'carvao') {
      parts.filter(p => p[0] === 'c' && p[5] >= 0.4).slice(0, 2).forEach((p, j) => smoke.push({x: px + p[1] * scale, y: y0 + (p[2] + p[5]) * scale, z: pz + p[3] * scale, ph: ((h >> (3 + j)) % 10) / 10, s: scale, dark: k === 'carvao'}));
    }
  }

  function rebuild(s) {
    const T = root.THREE;
    clearScene(); mode = 'city';
    const tiles = s.tiles; let last = 0, built = 0;
    tiles.forEach((t, i) => { if (t) { last = i; built++; } });
    const count = Math.min(tiles.length, last + 5);
    const items = {b: [], c: [], r: [], t: [], lamp: []};
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (let i = 0; i < count; i++) {
      const [gx, gz] = spiral(i); minx = Math.min(minx, gx); maxx = Math.max(maxx, gx); minz = Math.min(minz, gz); maxz = Math.max(maxz, gz);
    }
    for (let i = 0; i < count; i++) {
      const [gx, gz] = spiral(i), px = gx * PITCH, pz = gz * PITCH, k = tiles[i], h = hash(i);
      items.b.push([px, 0.02, pz, 0.98, 0.03, 0.98, 0xb9bfc7, 0, 0]);                                  // calçada
      items.b.push([px, 0.05, pz, 0.82, 0.03, 0.82, k ? GRASS : (h % 3 ? 0x6fb35a : 0x78bd62), 0, 0]);   // terreno
      if (!k) {                                                                                           // terreno livre: uma ou duas árvores
        const n = 1 + (h % 2);
        for (let j = 0; j < n; j++) { const ox = ((h >> (3 + j * 4)) % 7 - 3) * 0.09, oz = ((h >> (5 + j * 4)) % 7 - 3) * 0.09; items.b.push([px + ox, 0.08, pz + oz, 0.03, 0.08, 0.03, 0x6b4a2b, 0, 0]); items.t.push([px + ox, 0.14, pz + oz, 0.17, 0.3, 0.17, 0x2f7d3a, 0, 0]); }
        continue;
      }
      emit(items, k, Math.max(1, Math.min(3, (s.lv && s.lv[i]) || 1)), h, px, pz, SCALE, 0.08);
    }
    // ruas: faixas tracejadas no meio de cada quadra e postes de luz nos cruzamentos
    const x0 = minx - 1, x1 = maxx, z0 = minz - 1, z1 = maxz, xs = [], zs = [];
    for (let i = x0; i <= x1; i++) xs.push((i + 0.5) * PITCH);
    for (let j = z0; j <= z1; j++) zs.push((j + 0.5) * PITCH);
    for (const x of xs) for (let j = minz - 1; j <= maxz + 1; j++) items.b.push([x, 0.012, j * PITCH, 0.025, 0.006, 0.34, 0xe9e6c8, 0, 0]);
    for (const z of zs) for (let i = minx - 1; i <= maxx + 1; i++) items.b.push([i * PITCH, 0.012, z, 0.34, 0.006, 0.025, 0xe9e6c8, 0, 0]);
    xs.forEach((x, a) => zs.forEach((z, b) => {
      if ((a + b) % 2) return;
      items.c.push([x + 0.17, 0.0, z + 0.17, 0.025, 0.3, 0.025, 0x5c6470, 0, 0]);
      items.lamp.push([x + 0.17, 0.3, z + 0.17, 0.08, 0.03, 0.08, 0xffe9a0, 0, 0]);
    }));
    ['b', 'c', 'r', 't'].forEach(k => { const m = makeInst(geoms[k], items[k]); if (m) meshes.push(m); });
    const lm = makeInst(geoms.b, items.lamp, new T.MeshBasicMaterial({color: 0xffffff})); if (lm) meshes.push(lm);
    // chão: gramado enorme (some na neblina) e o asfalto só onde tem rua
    const gw = (maxx - minx + 4) * PITCH, gd = (maxz - minz + 4) * PITCH, cx = (minx + maxx) / 2 * PITCH, cz = (minz + maxz) / 2 * PITCH;
    ground = new T.Group();
    const terrain = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshLambertMaterial({color: 0x3f7a35})); terrain.rotation.x = -Math.PI / 2; terrain.position.set(cx, -0.02, cz);
    const asphalt = new T.Mesh(new T.PlaneGeometry(gw - 2 * PITCH + 0.6, gd - 2 * PITCH + 0.6), new T.MeshLambertMaterial({color: ROAD})); asphalt.rotation.x = -Math.PI / 2; asphalt.position.set(cx, 0.005, cz);
    ground.add(terrain, asphalt); scene.add(ground);
    lay = {minx: (minx - 1) * PITCH, maxx: (maxx + 1) * PITCH, minz: (minz - 1) * PITCH, maxz: (maxz + 1) * PITCH, xs, zs};
    view.tx = cx; view.tz = cz;
    view.span = Math.max(maxx - minx, maxz - minz) * PITCH + 3;
    if (!view.touched) view.dist = fitDist();
    buildTraffic(built); buildEffects();
  }

  // ---------- Cidades de outros países: monta uma cidade a partir do nível e do tamanho ----------
  const MIX = ['casa', 'casa', 'casa', 'loja', 'predio', 'escola', 'parque', 'casa', 'hospital', 'loja', 'policia', 'fabrica', 'casa', 'agua', 'predio', 'solar', 'tecnologia', 'floresta', 'eolica', 'universidade', 'mercado', 'bombeiros', 'condominio', 'esgoto'];
  function synthCity(info) {
    const L = info.level, seed = hash((info.key || 'x').split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const n = info.nation ? Math.min(150, 36 + L * 8) : 8 + L * 7, tiles = ['prefeitura'], lv = [1];
    const pool = MIX.slice(0, Math.min(MIX.length, 8 + L * 2));
    for (let i = 1; i < n; i++) {
      const h = hash(seed + i * 17); let k = pool[h % pool.length];
      if (k === 'fabrica' && L < 3) k = 'casa'; if (k === 'predio' && L < 2) k = 'casa';
      tiles.push(k);
      const roll = (h >> 5) % 100, up = Math.min(95, (L - 1) * 9 + (info.nation ? 25 : 0));
      lv.push(roll < up * 0.45 ? 3 : roll < up ? 2 : 1);
    }
    return {tiles, lv};
  }

  // ---------- O mundo: ilhas com a sua capital e as cidades que você comprou ----------
  function rebuildWorld(sim) {
    const T = root.THREE, S = root.Sim;
    clearScene(); mode = 'world';
    const items = {b: [], c: [], r: [], t: [], lamp: []}, R = 8.5, flags = [];
    const island = (x, z, r, sand, grass) => { items.c.push([x, -0.04, z, r * 2, 0.16, r * 2, sand, 0, 0]); items.c.push([x, -0.02, z, r * 1.7, 0.2, r * 1.7, grass, 0, 0]); };
    const flag = (x, z, h, col) => { items.b.push([x, 0.18, z, 0.03, h, 0.03, 0xdddddd, 0, 0]); items.b.push([x + 0.1, 0.18 + h - 0.12, z, 0.2, 0.12, 0.02, col, 0, 0]); };
    const mini = (tiles, lvs, ox, oz, pitch, scale, maxN) => {
      let n = 0;
      for (let i = 0; i < tiles.length && n < maxN; i++) {
        if (!tiles[i]) continue; const [gx, gz] = spiral(n++);
        emit(items, tiles[i], Math.max(1, Math.min(3, (lvs && lvs[i]) || 1)), hash(i + 5), ox + gx * pitch, oz + gz * pitch, scale, 0.18);
      }
    };
    // capital no centro
    const cap = sim.tiles.filter(Boolean).length, rc = 1.8 + Math.min(1.6, Math.log10(1 + sim.pop / 50) * 0.55);
    island(0, 0, rc, 0xe7d9a8, 0x5d9c4a);
    const capTiles = [], capLv = []; sim.tiles.forEach((k, i) => { if (k) { capTiles.push(k); capLv.push((sim.lv && sim.lv[i]) || 1); } });
    mini(capTiles, capLv, 0, 0, 0.36, 0.28, 75); flag(0, rc * 0.8, 0.7, 0xd33f3f);
    // as 11 ilhas dos países
    S.NEIGHBORS.forEach((n, i) => {
      const a = (i / S.NEIGHBORS.length) * Math.PI * 2 + 0.3, rr = R + (i % 2 ? 1.2 : -0.6), x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const info = S.colonyInfo(sim, n.key);
      if (!info.owned) {
        island(x, z, 1.0, 0xdcd0a0, 0x4f9a46);
        items.b.push([x - 0.25, 0.18, z + 0.1, 0.02, 0.06, 0.02, 0x6b4a2b, 0, 0]); items.t.push([x - 0.25, 0.22, z + 0.1, 0.18, 0.34, 0.18, 0x2f7d3a, 0, 0]);
        items.t.push([x + 0.2, 0.2, z - 0.15, 0.2, 0.4, 0.2, 0x2f7d3a, 0, 0]); emit(items, 'casa', 1, i, x + 0.05, z + 0.25, 0.3, 0.18);
        return;
      }
      const r = info.nation ? 1.9 : 1.2;
      island(x, z, r, 0xe7d9a8, info.nation ? 0x6aa84f : 0x5d9c4a);
      const c = synthCity({key: n.key, level: info.level, nation: info.nation});
      mini(c.tiles, c.lv, x, z, 0.34, 0.26, info.nation ? 70 : 24);
      flag(x, z + r * 0.78, info.nation ? 0.75 : 0.5, info.nation ? 0xf4b942 : 0x3d85c6);
    });
    ['b', 'c', 'r', 't'].forEach(k => { const m = makeInst(geoms[k], items[k]); if (m) meshes.push(m); });
    const sea = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshLambertMaterial({color: 0x1f6f9f})); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.06;
    ground = new T.Group(); ground.add(sea); scene.add(ground);
    // barcos dando voltas
    for (let i = 0; i < 7; i++) boats.push({r: 4.6 + (i % 4) * 2.3, a: (i / 7) * Math.PI * 2, sp: (0.05 + (i % 3) * 0.025) * (i % 2 ? 1 : -1), col: CAR_COLORS[i % CAR_COLORS.length]});
    view.tx = 0; view.tz = 0; view.span = (R + 5.5) * 2; lay = null;
    if (!view.touched) view.dist = fitDist();
    buildEffects(); buildBoats();
  }

  // peças que se mexem: carros, pedestres, nuvens, fumaça das fábricas, hélices
  function dynMesh(geo, count, basic) {
    const T = root.THREE, m = new T.InstancedMesh(geo, basic ? new T.MeshBasicMaterial({color: 0xffffff}) : new T.MeshLambertMaterial({color: 0xffffff}), count);
    m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); dyn.push(m); return m;
  }
  const rnd = (i, m, n) => (hash(i * m + n) % 1000) / 1000;
  function buildTraffic(built) {
    const k = T_(), n = Math.max(6, Math.min(60, Math.round(built * 0.7))), nw = Math.max(8, Math.min(50, Math.round(built * 0.8)));
    for (let i = 0; i < n; i++) {
      const alongZ = i % 2 === 0, lines = alongZ ? lay.xs : lay.zs, dir = hash(i * 3 + 1) % 2 ? 1 : -1, lo = alongZ ? lay.minz : lay.minx, hi = alongZ ? lay.maxz : lay.maxx;
      cars.push({alongZ, line: lines[hash(i * 5 + 2) % lines.length] + dir * 0.06, dir, speed: 0.5 + rnd(i, 7, 3) * 0.7, t: lo + rnd(i, 11, 4) * (hi - lo), lo, hi, color: CAR_COLORS[hash(i * 13 + 5) % CAR_COLORS.length]});
    }
    for (let i = 0; i < nw; i++) {
      const alongZ = i % 2 === 1, lines = alongZ ? lay.xs : lay.zs, side = hash(i * 9 + 1) % 2 ? 0.2 : -0.2, dir = hash(i * 3 + 8) % 2 ? 1 : -1, lo = alongZ ? lay.minz : lay.minx, hi = alongZ ? lay.maxz : lay.maxx;
      walkers.push({alongZ, line: lines[hash(i * 5 + 4) % lines.length] + side, dir, speed: 0.1 + rnd(i, 5, 9) * 0.14, t: lo + rnd(i, 13, 2) * (hi - lo), lo, hi, skin: SKIN[hash(i) % 4], cloth: CLOTHES[hash(i * 3) % CLOTHES.length]});
    }
    const cb = dynMesh(geoms.b, n), cc = dynMesh(geoms.b, n), wb = dynMesh(geoms.b, nw), wh = dynMesh(geoms.b, nw);
    cars.forEach((c, i) => { cb.setColorAt(i, k.col.setHex(c.color)); cc.setColorAt(i, k.col.setHex(0xcfe3f2)); });
    walkers.forEach((w, i) => { wb.setColorAt(i, k.col.setHex(w.cloth)); wh.setColorAt(i, k.col.setHex(w.skin)); });
    [cb, cc, wb, wh].forEach(m => { m.instanceColor.needsUpdate = true; });
    cars.mesh = [cb, cc]; walkers.mesh = [wb, wh];
    // nuvens
    const w = lay.maxx - lay.minx + 12, d = lay.maxz - lay.minz + 12;
    makeClouds(lay.minx - 6, lay.minz - 6, w, d);
  }
  function makeClouds(x0, z0, w, d) {
    const T = root.THREE; cloudData = [];
    for (let i = 0; i < 4; i++) cloudData.push({x: x0 + rnd(i, 17, 9) * w, z: z0 + rnd(i, 19, 7) * d, y: 6 + (i % 3) * 0.6, s: 0.5 + (hash(i * 23) % 50) / 100, sp: 0.12 + (i % 3) * 0.05, x0: x0, x1: x0 + w});
    clouds = new T.InstancedMesh(geoms.b, new T.MeshLambertMaterial({color: 0xffffff, transparent: true, opacity: 0.7}), cloudData.length * 3);
    clouds.instanceMatrix.setUsage(T.DynamicDrawUsage); clouds.frustumCulled = false; scene.add(clouds);
  }
  function buildEffects() {
    if (smoke.length) smoke.mesh = dynMesh(geoms.b, smoke.length * 3);
    if (turbines.length) { turbines.mesh = dynMesh(geoms.b, turbines.length * 3); const k = T_(); for (let i = 0; i < turbines.length * 3; i++) turbines.mesh.setColorAt(i, k.col.setHex(0xffffff)); turbines.mesh.instanceColor.needsUpdate = true; }
    if (mode === 'world') makeClouds(-14, -14, 28, 28);
  }
  function buildBoats() {
    if (!boats.length) return;
    const k = T_(); boats.mesh = [dynMesh(geoms.b, boats.length), dynMesh(geoms.b, boats.length)];
    boats.forEach((b, i) => { boats.mesh[0].setColorAt(i, k.col.setHex(b.col)); boats.mesh[1].setColorAt(i, k.col.setHex(0xffffff)); });
    boats.mesh.forEach(m => { m.instanceColor.needsUpdate = true; });
  }

  function animate(dt) {
    if (!lay && mode === 'city') return;
    clock += dt; const k = T_(), {m4, q, e, v, sc} = k, TAU = Math.PI * 2;
    if (cars.mesh) {
      const [body, cabin] = cars.mesh;
      cars.forEach((c, i) => {
        c.t += c.dir * c.speed * dt; if (c.t > c.hi) c.t = c.lo; else if (c.t < c.lo) c.t = c.hi;
        const x = c.alongZ ? c.line : c.t, z = c.alongZ ? c.t : c.line;
        e.set(0, c.alongZ ? Math.PI / 2 : 0, 0); q.setFromEuler(e);
        v.set(x, 0.07, z); sc.set(0.26, 0.09, 0.13); m4.compose(v, q, sc); body.setMatrixAt(i, m4);
        v.set(x, 0.15, z); sc.set(0.13, 0.08, 0.115); m4.compose(v, q, sc); cabin.setMatrixAt(i, m4);
      });
      body.instanceMatrix.needsUpdate = true; cabin.instanceMatrix.needsUpdate = true;
    }
    if (walkers.mesh) {
      const [bd, hd] = walkers.mesh; e.set(0, 0, 0); q.setFromEuler(e);
      walkers.forEach((w, i) => {
        w.t += w.dir * w.speed * dt; if (w.t > w.hi) w.t = w.lo; else if (w.t < w.lo) w.t = w.hi;
        const x = w.alongZ ? w.line : w.t, z = w.alongZ ? w.t : w.line, bob = Math.abs(Math.sin(clock * 6 + i)) * 0.008;
        v.set(x, 0.07 + bob, z); sc.set(0.035, 0.07, 0.035); m4.compose(v, q, sc); bd.setMatrixAt(i, m4);
        v.set(x, 0.14 + bob, z); sc.set(0.03, 0.03, 0.03); m4.compose(v, q, sc); hd.setMatrixAt(i, m4);
      });
      bd.instanceMatrix.needsUpdate = true; hd.instanceMatrix.needsUpdate = true;
    }
    if (smoke.mesh) {
      let n = 0; e.set(0, 0, 0); q.setFromEuler(e);
      smoke.forEach((s) => {
        for (let j = 0; j < 3; j++) {
          const p = (clock * 0.28 + s.ph + j / 3) % 1, size = (0.05 + p * 0.14) * (s.s / 0.8) * (1 - p * 0.35);
          v.set(s.x + p * 0.2 * s.s, s.y + p * 0.75 * s.s, s.z + p * 0.06); sc.set(size, size, size); m4.compose(v, q, sc); smoke.mesh.setMatrixAt(n, m4);
          smoke.mesh.setColorAt(n, k.col.setHex(s.dark ? (p < 0.5 ? 0x555555 : 0x777777) : (p < 0.5 ? 0xb0b0b0 : 0xd8d8d8))); n++;
        }
      });
      smoke.mesh.instanceMatrix.needsUpdate = true; smoke.mesh.instanceColor.needsUpdate = true;
    }
    if (turbines.mesh) {
      let n = 0;
      turbines.forEach(t => {
        for (let j = 0; j < 3; j++) {
          const a = clock * 1.6 + t.ph + (j * TAU) / 3;
          e.set(0, 0, a, 'YXZ'); q.setFromEuler(e); v.set(t.x, t.y, t.z); sc.set(0.035, t.len, 0.012); m4.compose(v, q, sc); turbines.mesh.setMatrixAt(n++, m4);
        }
      });
      turbines.mesh.instanceMatrix.needsUpdate = true;
    }
    if (boats.mesh) {
      const [hull, sail] = boats.mesh;
      boats.forEach((b, i) => {
        b.a += b.sp * dt; const x = Math.cos(b.a) * b.r, z = Math.sin(b.a) * b.r, yaw = -b.a + (b.sp > 0 ? 0 : Math.PI);
        e.set(0, yaw, 0); q.setFromEuler(e);
        v.set(x, -0.04, z); sc.set(0.34, 0.1, 0.14); m4.compose(v, q, sc); hull.setMatrixAt(i, m4);
        v.set(x, 0.06, z); sc.set(0.03, 0.34, 0.2); m4.compose(v, q, sc); sail.setMatrixAt(i, m4);
      });
      hull.instanceMatrix.needsUpdate = true; sail.instanceMatrix.needsUpdate = true;
    }
    if (clouds && cloudData.length) {
      let n = 0; e.set(0, 0, 0); q.setFromEuler(e);
      cloudData.forEach(c => {
        c.x += c.sp * dt; if (c.x > c.x1) c.x = c.x0;
        [[0, 0, 1.0, 0.18, 0.6], [0.35 * c.s, 0.03, 0.7, 0.14, 0.45], [-0.3 * c.s, -0.02, 0.6, 0.12, 0.4]].forEach(([ox, oy, w, h, d]) => { v.set(c.x + ox, c.y + oy, c.z); sc.set(w * c.s, h, d * c.s); m4.compose(v, q, sc); clouds.setMatrixAt(n++, m4); });
      });
      clouds.instanceMatrix.needsUpdate = true;
    }
  }

  // distância da câmera para a cidade caber na tela (em pé a tela é estreita, então afasta mais)
  function fitDist() {
    const asp = camera ? camera.aspect : 1, span = view.span || 8;
    return Math.max(6, span * (asp >= 1 ? 1.05 : 1.05 / Math.max(0.35, asp) * 0.78) * (mode === 'world' ? 1.18 : 1));
  }
  // Dia e noite: um ciclo de 2min40s; a fumaça das fábricas (poluição) deixa o céu mais sujo
  function daylight() { return 0.5 + 0.5 * Math.sin(((Date.now() / 1000) % 160) / 160 * Math.PI * 2 + 1.2); }
  function applySky() {
    const T = root.THREE, d = daylight(), poll = focusNow === 'capital' && state ? Math.min(1, (state.pollution || 0) / 20) : 0;
    const top = new T.Color(0x050b16).lerp(new T.Color(0x3f86c4), d).lerp(new T.Color(0x77705a), poll * 0.7);
    const bot = new T.Color(0x15233a).lerp(new T.Color(0xa9d0ea), d).lerp(new T.Color(0x8a8466), poll * 0.7);
    if (host) host.style.background = `linear-gradient(#${top.getHexString()},#${bot.getHexString()})`;
    if (!scene.fog) scene.fog = new T.Fog(bot.getHex(), 30, 120); else scene.fog.color.copy(bot);
    if (hemi) { hemi.intensity = 0.38 + 0.55 * d; hemi.color.setHex(d > 0.35 ? 0xdfeaff : 0x7f9bd6); }
    if (sunL) { sunL.intensity = 0.12 + 0.85 * d; sunL.color.set(new T.Color(0xff9a5a).lerp(new T.Color(0xfff0d0), Math.min(1, d * 1.4))); sunL.position.set(-6 * (0.4 + d), 5 + 7 * d, 5); }
  }

  function place() {
    const cp = Math.cos(view.pitch), d = view.dist;
    camera.position.set(view.tx + Math.sin(view.yaw) * cp * d, Math.sin(view.pitch) * d, view.tz + Math.cos(view.yaw) * cp * d);
    camera.lookAt(view.tx, 0.2, view.tz);
    if (scene.fog) { scene.fog.near = d * 0.8; scene.fog.far = d * 2.4; }
  }
  let lastTs = 0;
  function frame(ts) {
    raf = 0;
    if (!host) return;
    if (ts - lastTs >= 33) {                                // 30 quadros por segundo bastam e poupam bateria
      const dt = Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts;
      animate(dt); if (ts - skyAt > 700) { skyAt = ts; applySky(); } place(); renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);
  }
  function schedule() { if (!raf && host) raf = requestAnimationFrame(frame); }

  // ---------- Controles: arrastar gira, pinça aproxima, duas pontas movem ----------
  const ptrs = new Map(); let lastPinch = 0, lastMid = null, lastTap = 0;
  function bind(el) {
    if (boundTo === el) return; boundTo = el;
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture && el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); view.touched = true;
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; lastPinch = Math.hypot(a[0] - b[0], a[1] - b[1]); lastMid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
      const now = Date.now(); if (ptrs.size === 1 && now - lastTap < 320) { view.yaw = 0.8; view.pitch = 0.75; view.touched = false; view.dist = fitDist(); dirty = true; schedule(); } lastTap = now;
    });
    el.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) {
        view.yaw -= (e.clientX - prev[0]) * 0.008; view.pitch = Math.max(0.25, Math.min(1.45, view.pitch + (e.clientY - prev[1]) * 0.006));
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (lastPinch > 0) view.dist = Math.max(3, Math.min(60, view.dist * lastPinch / Math.max(1, dist)));
        if (lastMid) {
          const k = view.dist * 0.0016, dx = (mid[0] - lastMid[0]) * k, dy = (mid[1] - lastMid[1]) * k;
          view.tx -= Math.cos(view.yaw) * dx + Math.sin(view.yaw) * dy; view.tz += Math.sin(view.yaw) * dx - Math.cos(view.yaw) * dy;
        }
        lastPinch = dist; lastMid = mid;
      }
      dirty = true; schedule();
    });
    const up = e => { ptrs.delete(e.pointerId); lastPinch = 0; lastMid = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); view.touched = true; view.dist = Math.max(3, Math.min(60, view.dist * (1 + Math.sign(e.deltaY) * 0.1))); dirty = true; schedule(); }, {passive: false});
  }

  const City3D = {
    // chamada a cada atualização da tela do mapa; só reconstrói se algo mudou.
    // foco: 'capital' (sua cidade), 'world' (as ilhas do mundo) ou a chave de um país onde você tem cidade
    show(s, focus) {
      if (!mount()) return;
      const S = root.Sim; focus = focus || 'capital';
      let info = null;
      if (focus !== 'capital' && focus !== 'world') { info = S.colonyInfo(s, focus); if (!info.owned) focus = 'capital'; }
      let next;
      if (focus === 'capital') next = 'c|' + s.tiles.join(',') + '|' + (s.lv || []).join('') + '|' + Math.round(S.analyze(s).pollution / 3);
      else if (focus === 'world') next = 'w|' + s.tiles.filter(Boolean).length + '|' + Math.round(Math.log10(1 + s.pop) * 4) + '|' + S.NEIGHBORS.map(n => { const i = S.colonyInfo(s, n.key); return i.owned ? i.level + (i.nation ? 'N' : 'c') : '-'; }).join('');
      else next = 'k|' + focus + '|' + info.level + '|' + info.nation;
      if (focus !== focusNow) { focusNow = focus; view.touched = false; sig = ''; }
      state = focus === 'capital' ? S.analyze(s) : null;
      if (next !== sig) {
        sig = next;
        if (focus === 'capital') rebuild(s); else if (focus === 'world') rebuildWorld(s); else rebuild(synthCity({key: focus, level: info.level, nation: info.nation}));
        applySky();
      }
      resize(); dirty = true; schedule();
    },
    hide() { if (raf) cancelAnimationFrame(raf); raf = 0; host = null; boundTo = null; if (ro) { ro.disconnect(); ro = null; } if (renderer && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); },
    _spiral: spiral, _parts: BUILD, _cars: () => cars, _synth: synthCity, _mode: () => mode, view,
  };
  root.City3D = City3D;
})(typeof window !== 'undefined' ? window : globalThis);
