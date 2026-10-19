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
      return [B(0, 0, 0, 0.62, 0.62, 0.5, w), R(0, 0.62, 0, 0.7, 0.28, 0.56, r), B(-0.5, 0, 0, 0.34, 0.42, 0.42, w), R(-0.5, 0.42, 0, 0.4, 0.2, 0.48, r), B(0.5, 0, 0, 0.34, 0.42, 0.42, w), R(0.5, 0.42, 0, 0.4, 0.2, 0.48, r),
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
      if (lv >= 2) p.push(B(-0.5, 0, 0, 0.3, 0.4, 0.42, 0xe3d6b8));
      if (lv >= 3) p.push(B(0.5, 0, 0, 0.3, 0.5, 0.42, 0xe3d6b8), B(0, 0, -0.4, 0.8, 0.2, 0.16, 0xd2c6a6));
      return p;
    },
    hospital: (lv) => {
      const hh = 0.4 + 0.22 * (lv - 1), p = [B(0, 0, 0, 0.7, hh, 0.5, 0xf4f6f8), B(0.0, hh, 0.0, 0.5, 0.02, 0.1, 0xe03b3b), B(0.0, hh, 0.0, 0.1, 0.02, 0.5, 0xe03b3b), B(0, 0.06, 0.26, 0.28, 0.16, 0.02, 0x6fa8dc)];
      floors(p, 0.7, 0.5, Math.round(hh / 0.2), 0.04, 0.2, 0x8ea6bd);
      if (lv >= 2) p.push(B(0.46, 0, 0, 0.26, hh * 0.7, 0.4, 0xe4e8ec));
      if (lv >= 3) p.push(B(-0.46, 0, 0, 0.26, hh * 0.7, 0.4, 0xe4e8ec), C(0.0, hh + 0.02, 0, 0.3, 0.02, 0xdddddd));
      return p;
    },
    policia: (lv) => {
      const p = [B(0, 0, 0, 0.6, 0.3 + 0.1 * (lv - 1), 0.46, 0x4a6fa5), B(0, 0.3 + 0.1 * (lv - 1), 0, 0.64, 0.05, 0.5, 0x2e4a73), B(0.22, 0.35, 0.0, 0.1, 0.2, 0.1, 0x2e4a73), B(0.22, 0.55, 0.0, 0.08, 0.05, 0.08, 0xe04b4b), B(-0.12, 0.06, 0.24, 0.22, 0.14, 0.02, 0xdbe7f5)];
      if (lv >= 2) p.push(B(-0.4, 0, 0, 0.24, 0.26, 0.36, 0x4a6fa5));
      if (lv >= 3) p.push(B(0.4, 0, 0, 0.24, 0.34, 0.36, 0x4a6fa5), B(0, 0, 0.42, 0.7, 0.02, 0.1, 0x555b66));
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
      const hgt = 0.7 + 0.2 * lv, p = [C(0, 0, 0, 0.07, hgt, 0xf1f1f1), B(0, hgt - 0.03, 0.04, 0.08, 0.08, 0.14, 0xdedede)], len = 0.3 + 0.05 * lv;
      for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI) / 3 + 0.4; p.push(B(-Math.sin(a) * len / 2, hgt + 0.01 + Math.cos(a) * len / 2, 0.12, 0.035, len, 0.012, 0xffffff, 0, a)); }
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
  let geoms = null;

  function ensure() {
    const T = root.THREE;
    if (renderer) return true;
    if (!T) return false;
    try {
      renderer = new T.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'low-power'});
    } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(40, 1, 0.1, 400);
    scene.add(new T.HemisphereLight(0xdfeaff, 0x4f5f3e, 0.85));
    const sun = new T.DirectionalLight(0xfff0d0, 0.95); sun.position.set(-6, 11, 5); scene.add(sun);
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
  function rebuild(s) {
    const T = root.THREE;
    meshes.forEach(m => { scene.remove(m); m.material.dispose(); m.dispose && m.dispose(); });
    meshes = [];
    if (ground) { scene.remove(ground); ground.geometry.dispose(); ground.material.dispose(); }
    const tiles = s.tiles; let last = 0;
    tiles.forEach((t, i) => { if (t) last = i; });
    const count = Math.min(tiles.length, last + 5);
    const items = {b: [], c: [], r: [], t: []}, lots = [];
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (let i = 0; i < count; i++) {
      const [px, pz] = spiral(i), k = tiles[i];
      minx = Math.min(minx, px); maxx = Math.max(maxx, px); minz = Math.min(minz, pz); maxz = Math.max(maxz, pz);
      lots.push([px, pz, k ? 1 : 0.6]);
      if (!k || !BUILD[k]) continue;
      const lv = Math.max(1, Math.min(3, (s.lv && s.lv[i]) || 1)), parts = BUILD[k](lv, hash(i));
      const ry = ((hash(i * 7 + 3) % 4) * Math.PI) / 2 * 0;       // sem giro: as fachadas ficam alinhadas com a rua
      parts.forEach(([type, x, y, z, sx, sy, sz, col, rot, rz]) => items[type].push([px + x, 0.05 + y, pz + z, sx, sy, sz, col, rot + ry, rz]));
    }
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3(), col = new T.Color();
    const make = (geo, list) => {
      if (!list.length) return;
      const mesh = new T.InstancedMesh(geo, new T.MeshLambertMaterial({color: 0xffffff}), list.length);
      list.forEach((it, n) => {
        e.set(0, it[7], it[8], 'YXZ'); q.setFromEuler(e); v.set(it[0], it[1], it[2]); sc.set(it[3], it[4], it[5]);
        m4.compose(v, q, sc); mesh.setMatrixAt(n, m4); mesh.setColorAt(n, col.setHex(it[6]));
      });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh); meshes.push(mesh);
    };
    // terrenos (gramado) e ruas (chão escuro por baixo)
    const lotMesh = [];
    lots.forEach(([x, z, f]) => lotMesh.push([x, 0, z, 0.9, 0.05, 0.9, f === 1 ? GRASS : 0x78a85f, 0, 0]));
    make(geoms.b, lotMesh);
    make(geoms.b, items.b); make(geoms.c, items.c); make(geoms.r, items.r); make(geoms.t, items.t);
    const w = maxx - minx + 3, d = maxz - minz + 3;
    ground = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshLambertMaterial({color: ROAD}));
    ground.rotation.x = -Math.PI / 2; ground.position.set((minx + maxx) / 2, 0.01, (minz + maxz) / 2); scene.add(ground);
    view.tx = (minx + maxx) / 2; view.tz = (minz + maxz) / 2;
    view.span = Math.max(maxx - minx, maxz - minz) + 3;
    if (!view.touched) view.dist = fitDist();
  }

  // distância da câmera para a cidade caber na tela (em pé a tela é estreita, então afasta mais)
  function fitDist() {
    const asp = camera ? camera.aspect : 1, span = view.span || 8;
    return Math.max(6, span * (asp >= 1 ? 1.05 : 1.05 / Math.max(0.35, asp) * 0.78));
  }
  function atmosphere(s) {
    const T = root.THREE, a = state, poll = a ? Math.min(1, (a.pollution || 0) / 20) : 0;
    const c = new T.Color(0x1b3350).lerp(new T.Color(0x6b6a55), poll);
    if (host) host.style.background = `linear-gradient(#${new T.Color(0x10243b).lerp(new T.Color(0x77705a), poll).getHexString()},#${c.getHexString()})`;
    scene.fog = new T.Fog(c.getHex(), 18, 60 - 28 * poll);
  }

  function place() {
    const cp = Math.cos(view.pitch), d = view.dist;
    camera.position.set(view.tx + Math.sin(view.yaw) * cp * d, Math.sin(view.pitch) * d, view.tz + Math.cos(view.yaw) * cp * d);
    camera.lookAt(view.tx, 0.2, view.tz);
  }
  function frame() {
    raf = 0;
    if (!dirty || !host) return;
    dirty = false; place(); renderer.render(scene, camera);
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
    // chamada a cada atualização da tela do mapa; só reconstrói a cidade se algo mudou
    show(s) {
      if (!mount()) return;
      const next = s.tiles.join(',') + '|' + (s.lv || []).join('') + '|' + Math.round((root.Sim ? root.Sim.analyze(s).pollution : 0) / 3);
      state = root.Sim ? root.Sim.analyze(s) : null;
      if (next !== sig) { sig = next; rebuild(s); atmosphere(s); dirty = true; }
      resize(); dirty = true; schedule();
    },
    hide() { if (raf) cancelAnimationFrame(raf); raf = 0; host = null; boundTo = null; if (ro) { ro.disconnect(); ro = null; } if (renderer && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); },
    _spiral: spiral, _parts: BUILD, view,
  };
  root.City3D = City3D;
})(typeof window !== 'undefined' ? window : globalThis);
