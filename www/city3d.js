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
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.75));
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
  const PITCH = 1.3, SCALE = 0.8;                       // distância entre terrenos (o vão vira rua) e tamanho dos prédios
  let cars = [], carMeshes = [], clouds = null, cloudData = [], lay = null, carCfg = null;
  const CAR_COLORS = [0xd9453d, 0x3d85c6, 0xf4b942, 0xf1f1f1, 0x2f2f35, 0x4fae45, 0xa78bfa, 0xff8a3d];

  function disposeMesh(m) { scene.remove(m); m.material.dispose(); if (m.dispose) m.dispose(); }
  function rebuild(s) {
    const T = root.THREE;
    meshes.forEach(disposeMesh); meshes = []; carMeshes.forEach(disposeMesh); carMeshes = []; if (clouds) { disposeMesh(clouds); clouds = null; }
    if (ground) { scene.remove(ground); ground.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); }); ground = null; }
    const tiles = s.tiles; let last = 0, built = 0;
    tiles.forEach((t, i) => { if (t) { last = i; built++; } });
    const count = Math.min(tiles.length, last + 5);
    const items = {b: [], c: [], r: [], t: []};
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
      if (!BUILD[k]) continue;
      const lv = Math.max(1, Math.min(3, (s.lv && s.lv[i]) || 1)), parts = BUILD[k](lv, h);
      parts.forEach(([type, x, y, z, sx, sy, sz, col, rot, rz]) => items[type].push([px + x * SCALE, 0.08 + y * SCALE, pz + z * SCALE, sx * SCALE, sy * SCALE, sz * SCALE, col, rot, rz]));
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
      items.b.push([x + 0.17, 0.3, z + 0.17, 0.07, 0.025, 0.07, 0xffe9a0, 0, 0]);
    }));
    const make = (geo, list, mat) => {
      if (!list.length) return null;
      const mesh = new T.InstancedMesh(geo, mat || new T.MeshLambertMaterial({color: 0xffffff}), list.length);
      const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3(), col = new T.Color();
      list.forEach((it, n) => {
        e.set(0, it[7], it[8], 'YXZ'); q.setFromEuler(e); v.set(it[0], it[1], it[2]); sc.set(it[3], it[4], it[5]);
        m4.compose(v, q, sc); mesh.setMatrixAt(n, m4); if (it[6] != null) mesh.setColorAt(n, col.setHex(it[6]));
      });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh); return mesh;
    };
    ['b', 'c', 'r', 't'].forEach(k => { const m = make(geoms[k], items[k]); if (m) meshes.push(m); });
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
    buildTraffic(built);
  }

  // Carros nas ruas e nuvens passando: poucas peças que se movem (só enquanto o mapa está aberto)
  function buildTraffic(built) {
    const T = root.THREE, n = Math.max(6, Math.min(60, Math.round(built * 0.7)));
    cars = [];
    for (let i = 0; i < n; i++) {
      const alongZ = i % 2 === 0, lines = alongZ ? lay.xs : lay.zs, dir = hash(i * 3 + 1) % 2 ? 1 : -1, lo = alongZ ? lay.minz : lay.minx, hi = alongZ ? lay.maxz : lay.maxx;
      cars.push({alongZ, line: lines[hash(i * 5 + 2) % lines.length] + dir * 0.06, dir, speed: 0.5 + (hash(i * 7 + 3) % 100) / 100 * 0.7, t: lo + (hash(i * 11 + 4) % 1000) / 1000 * (hi - lo), lo, hi, color: CAR_COLORS[hash(i * 13 + 5) % CAR_COLORS.length]});
    }
    const mk = (geo, count) => { const m = new T.InstancedMesh(geo, new T.MeshLambertMaterial({color: 0xffffff}), count); m.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(m); carMeshes.push(m); return m; };
    carCfg = {body: mk(geoms.b, n), cabin: mk(geoms.b, n), m4: new T.Matrix4(), q: new T.Quaternion(), e: new T.Euler(), v: new T.Vector3(), sc: new T.Vector3(), col: new T.Color()};
    cars.forEach((c, i) => { carCfg.body.setColorAt(i, carCfg.col.setHex(c.color)); carCfg.cabin.setColorAt(i, carCfg.col.setHex(0xcfe3f2)); });
    carCfg.body.instanceColor.needsUpdate = true; carCfg.cabin.instanceColor.needsUpdate = true;
    // nuvens
    cloudData = [];
    const w = lay.maxx - lay.minx + 12, d = lay.maxz - lay.minz + 12;
    for (let i = 0; i < 4; i++) cloudData.push({x: lay.minx - 6 + (hash(i * 17 + 9) % 1000) / 1000 * w, z: lay.minz - 6 + (hash(i * 19 + 7) % 1000) / 1000 * d, y: 6 + (i % 3) * 0.6, s: 0.5 + (hash(i * 23) % 50) / 100, sp: 0.12 + (i % 3) * 0.05});
    clouds = new T.InstancedMesh(geoms.b, new T.MeshLambertMaterial({color: 0xffffff, transparent: true, opacity: 0.7}), cloudData.length * 3);
    clouds.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(clouds);
    cloudBounds = {x0: lay.minx - 6, x1: lay.maxx + 6};
    animate(0);
  }
  let cloudBounds = null;
  function animate(dt) {
    if (!carCfg || !lay) return;
    const {body, cabin, m4, q, e, v, sc} = carCfg;
    cars.forEach((c, i) => {
      c.t += c.dir * c.speed * dt; if (c.t > c.hi) c.t = c.lo; else if (c.t < c.lo) c.t = c.hi;
      const x = c.alongZ ? c.line : c.t, z = c.alongZ ? c.t : c.line;
      e.set(0, c.alongZ ? Math.PI / 2 : 0, 0); q.setFromEuler(e);
      v.set(x, 0.07, z); sc.set(0.26, 0.09, 0.13); m4.compose(v, q, sc); body.setMatrixAt(i, m4);
      v.set(x, 0.15, z); sc.set(0.13, 0.08, 0.115); m4.compose(v, q, sc); cabin.setMatrixAt(i, m4);
    });
    body.instanceMatrix.needsUpdate = true; cabin.instanceMatrix.needsUpdate = true;
    if (clouds) {
      let n = 0; e.set(0, 0, 0); q.setFromEuler(e);
      cloudData.forEach(c => {
        c.x += c.sp * dt; if (c.x > cloudBounds.x1) c.x = cloudBounds.x0;
        [[0, 0, 1.0, 0.18, 0.6], [0.35 * c.s, 0.03, 0.7, 0.14, 0.45], [-0.3 * c.s, -0.02, 0.6, 0.12, 0.4]].forEach(([ox, oy, w, h, d]) => { v.set(c.x + ox, c.y + oy, c.z); sc.set(w * c.s, h, d * c.s); m4.compose(v, q, sc); clouds.setMatrixAt(n++, m4); });
      });
      clouds.instanceMatrix.needsUpdate = true;
    }
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
    scene.fog = new T.Fog(c.getHex(), 30, 120 - 50 * poll);
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
      animate(dt); place(); renderer.render(scene, camera);
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
    // chamada a cada atualização da tela do mapa; só reconstrói a cidade se algo mudou
    show(s) {
      if (!mount()) return;
      const next = s.tiles.join(',') + '|' + (s.lv || []).join('') + '|' + Math.round((root.Sim ? root.Sim.analyze(s).pollution : 0) / 3);
      state = root.Sim ? root.Sim.analyze(s) : null;
      if (next !== sig) { sig = next; rebuild(s); atmosphere(s); dirty = true; }
      resize(); dirty = true; schedule();
    },
    hide() { if (raf) cancelAnimationFrame(raf); raf = 0; host = null; boundTo = null; if (ro) { ro.disconnect(); ro = null; } if (renderer && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); },
    _spiral: spiral, _parts: BUILD, _cars: () => cars, view,
  };
  root.City3D = City3D;
})(typeof window !== 'undefined' ? window : globalThis);
