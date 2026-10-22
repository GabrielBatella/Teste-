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
  // b = caixa, w = caixa com janelas que acendem de noite, c = cilindro, v = cilindro com janelas, r = telhado em pirâmide,
  // t = cone (árvore), s = esfera/cúpula, o = anel, g = caixa que brilha, q = anel que brilha
  const B = (x, y, z, sx, sy, sz, c, ry, rz) => ['b', x, y, z, sx, sy, sz, c, ry || 0, rz || 0];
  const W = (x, y, z, sx, sy, sz, c) => ['w', x, y, z, sx, sy, sz, c, 0, 0];
  const C = (x, y, z, d, h, c) => ['c', x, y, z, d, h, d, c, 0, 0];
  const V = (x, y, z, d, h, c) => ['v', x, y, z, d, h, d, c, 0, 0];
  const R = (x, y, z, sx, sy, sz, c) => ['r', x, y, z, sx, sy, sz, c, Math.PI / 4, 0];
  const T = (x, y, z, d, h, c) => ['t', x, y, z, d, h, d, c, 0, 0];
  const S = (x, y, z, sx, sy, sz, c) => ['s', x, y, z, sx, sy, sz, c, 0, 0];
  const O = (x, y, z, d, th, c) => ['o', x, y, z, d, th / 0.12, d, c, 0, 0];
  const G = (x, y, z, sx, sy, sz, c) => ['g', x, y, z, sx, sy, sz, c, 0, 0];
  const Q = (x, y, z, d, th, c) => ['q', x, y, z, d, th / 0.12, d, c, 0, 0];
  const WALLS = [0xf1e4c3, 0xe9c9a0, 0xd9e3ea, 0xf2d4d0];
  const ROOFS = [0xb5533c, 0x8a4b3a, 0x6b5b95, 0x9a6b3d];
  const GLASS = [0xb7d4ea, 0x9fc4e0, 0xc4d9ea], NEON = [0x4de3ff, 0xff5ad1, 0x7dff9a];
  // árvores: copa redonda ou em cone, conforme a posição
  function trees(parts, list, h) {
    list.forEach(([x, z, s], i) => {
      parts.push(B(x, 0, z, 0.04, 0.1 * (h || 1), 0.04, 0x6b4a2b));
      if ((i + Math.round(x * 10)) % 2) parts.push(S(x, 0.1 * (h || 1) - 0.03, z, 0.22 * s, 0.26 * s * (h || 1), 0.22 * s, 0x3a8f46));
      else parts.push(T(x, 0.08 * (h || 1), z, 0.2 * s, 0.34 * s * (h || 1), 0x2f7d3a));
    });
  }

  const BUILD = {
    prefeitura: () => [W(0, 0, 0, 0.74, 0.34, 0.5, 0xeae4d2), B(0, 0.34, 0, 0.62, 0.05, 0.42, 0xc9a24a), B(-0.2, 0, 0.26, 0.05, 0.3, 0.05, 0xffffff), B(0.2, 0, 0.26, 0.05, 0.3, 0.05, 0xffffff), B(0, 0, 0.26, 0.05, 0.3, 0.05, 0xffffff),
      V(0, 0.39, 0, 0.26, 0.28, 0xeae4d2), S(0, 0.62, 0, 0.3, 0.26, 0.3, 0xe0b94a), B(0.0, 0.86, 0, 0.015, 0.22, 0.015, 0xdddddd), G(0.07, 1.0, 0, 0.12, 0.07, 0.01, 0xd33f3f)],
    casa: (lv, h) => {
      const w = WALLS[h % 4], r = ROOFS[(h >>> 3) % 4];
      if (lv === 1) return [W(0, 0, 0, 0.5, 0.3, 0.44, w), R(0, 0.3, 0, 0.6, 0.26, 0.52, r), B(0.12, 0, 0.23, 0.1, 0.18, 0.02, 0x7a5236), B(-0.15, 0.3, -0.05, 0.06, 0.2, 0.06, 0x8a8f98)];
      if (lv === 2) return [W(0, 0, 0, 0.56, 0.58, 0.5, w), R(0, 0.58, 0, 0.66, 0.28, 0.58, r), W(0.36, 0, 0.0, 0.16, 0.22, 0.3, 0xd7d7d7), B(-0.12, 0.62, 0, 0.18, 0.02, 0.2, 0x1e3a6e)];
      return [W(0, 0, 0, 0.62, 0.62, 0.5, w), R(0, 0.62, 0, 0.72, 0.3, 0.58, r), W(-0.42, 0, 0, 0.26, 0.42, 0.42, w), R(-0.42, 0.42, 0, 0.34, 0.22, 0.5, r), W(0.42, 0, 0, 0.26, 0.42, 0.42, w), R(0.42, 0.42, 0, 0.34, 0.22, 0.5, r),
        C(0, 0.0, 0.42, 0.3, 0.025, 0x5ab4e6), ...(() => { const p = []; trees(p, [[-0.4, 0.4, 0.8], [0.4, 0.4, 0.8]]); return p; })()];
    },
    predio: (lv, h) => {
      if (lv === 1) return [W(0, 0, 0, 0.56, 0.8, 0.5, 0xc9b79c), B(0, 0.8, 0, 0.4, 0.05, 0.34, 0x777777), B(0.15, 0.85, 0.1, 0.1, 0.06, 0.1, 0x8a8f98)];
      if (lv === 2) return [W(0, 0, 0, 0.58, 1.2, 0.52, 0xb9c3d1), W(0, 1.2, 0, 0.44, 0.3, 0.38, 0xa9b6c8), B(0, 1.5, 0, 0.3, 0.04, 0.26, 0x777777), B(0, 1.54, 0, 0.02, 0.28, 0.02, 0xdddddd), G(0, 1.82, 0, 0.05, 0.05, 0.05, 0xff5a5a)];
      const neon = NEON[h % 3];
      return [W(0, 0, 0, 0.6, 1.1, 0.54, GLASS[h % 3]), W(0, 1.1, 0, 0.48, 0.7, 0.42, GLASS[(h + 1) % 3]), W(0, 1.8, 0, 0.34, 0.5, 0.3, GLASS[(h + 2) % 3]), Q(0, 1.78, 0, 0.58, 0.03, neon), Q(0, 1.08, 0, 0.7, 0.03, neon),
        B(0, 2.3, 0, 0.02, 0.5, 0.02, 0xdddddd), G(0, 2.8, 0, 0.06, 0.06, 0.06, 0xff5a5a), G(0, 0.0, 0.28, 0.5, 0.025, 0.02, neon)];
    },
    condominio: (lv) => {
      const p = [V(-0.2, 0, -0.02, 0.34, 0.5 + 0.28 * (lv - 1), 0xe8dcc8), V(0.22, 0, 0.0, 0.28, 0.38 + 0.28 * (lv - 1), 0xd9c7a8), C(0, 0.0, 0.36, 0.34, 0.02, 0x5ab4e6), S(-0.2, 0.46 + 0.28 * (lv - 1), -0.02, 0.3, 0.12, 0.3, 0x4fa05a)];
      trees(p, [[-0.4, 0.4, 0.9], [0.42, 0.4, 0.9]]);
      if (lv >= 3) p.push(Q(0, 0.78, 0, 0.6, 0.025, 0xffd36b), B(0, 0.8, 0, 0.56, 0.02, 0.02, 0xc9a24a));
      return p;
    },
    loja: (lv, h) => {
      const col = [0xf4b942, 0x63b3ed, 0xed8b8b, 0xa78bfa][h % 4], H = 0.28 + 0.18 * (lv - 1);
      const p = [W(0, 0, 0, 0.7, H, 0.52, 0xece7dd), B(0, 0.2, 0.28, 0.72, 0.06, 0.12, col), G(0, H - 0.04, 0.27, 0.46, 0.06, 0.02, NEON[h % 3]), B(0, 0.06, 0.27, 0.5, 0.12, 0.02, 0x6fa8dc)];
      if (lv >= 2) p.push(B(0.0, H, 0, 0.62, 0.05, 0.44, 0x777777), S(0.2, H + 0.02, 0.0, 0.2, 0.1, 0.2, 0xcfd3d8));
      if (lv >= 3) p.push(V(-0.18, H, 0, 0.3, 0.3, 0x9ad0f0), S(-0.18, H + 0.26, 0, 0.3, 0.14, 0.3, 0xb7e0f5));
      return p;
    },
    mercado: (lv) => [W(0, 0, 0, 0.84, 0.3 + 0.12 * (lv - 1), 0.62, 0xdad4c6), B(0, 0.24, 0.32, 0.84, 0.07, 0.1, 0xd9453d), G(0, 0.36, 0.1, 0.52, 0.2 + 0.14 * lv, 0.04, 0xffc94a), B(0, 0, 0.46, 0.84, 0.012, 0.2, 0x555b66), G(-0.3, 0.02, 0.46, 0.2, 0.01, 0.02, 0xffffff), G(0.3, 0.02, 0.46, 0.2, 0.01, 0.02, 0xffffff), ...(lv >= 3 ? [V(0.28, 0.42, -0.1, 0.3, 0.2, 0x9ad0f0), S(0.28, 0.58, -0.1, 0.3, 0.14, 0.3, 0xb7e0f5)] : [])],
    fazenda: (lv) => {
      const p = [B(0, 0, 0, 0.9, 0.02, 0.9, 0xcfa95b)];
      for (let i = -3; i <= 3; i++) p.push(B(-0.18, 0.02, i * 0.12, 0.5, 0.05, 0.05, 0x5fae3f));
      p.push(W(0.3, 0, -0.2, 0.28, 0.2, 0.32, 0xb23a2e), R(0.3, 0.2, -0.2, 0.32, 0.14, 0.36, 0x7a2a22));
      if (lv >= 2) p.push(C(0.34, 0, 0.2, 0.12, 0.34, 0xcfd3d8), S(0.34, 0.3, 0.2, 0.12, 0.1, 0.12, 0x99a0a8));
      if (lv >= 3) p.push(C(0.12, 0, 0.3, 0.12, 0.4, 0xcfd3d8), S(0.12, 0.36, 0.3, 0.12, 0.1, 0.12, 0x99a0a8), B(-0.3, 0.07, 0.3, 0.3, 0.1, 0.14, 0xe0e0e0));
      return p;
    },
    fabrica: (lv) => {
      const p = [W(0, 0, 0, 0.74 + 0.04 * lv, 0.3 + 0.1 * (lv - 1), 0.5, 0x8b94a3), B(-0.15, 0.3 + 0.1 * (lv - 1), 0, 0.16, 0.08, 0.5, 0x6d7685), B(0.1, 0.3 + 0.1 * (lv - 1), 0, 0.16, 0.08, 0.5, 0x6d7685), C(0.3, 0, -0.16, 0.1, 0.5 + 0.2 * lv, 0x7b4a3a)];
      if (lv >= 2) p.push(C(0.18, 0, -0.16, 0.1, 0.4 + 0.2 * lv, 0x7b4a3a), W(-0.1, 0, 0.34, 0.5, 0.18, 0.18, 0xa5adbb));
      if (lv >= 3) p.push(C(-0.3, 0, -0.16, 0.2, 0.55, 0xcfd3d8), S(-0.3, 0.5, -0.16, 0.2, 0.12, 0.2, 0xcfd3d8), W(0.0, 0, -0.38, 0.8, 0.2, 0.16, 0x6d7685));
      return p;
    },
    tecnologia: (lv) => {
      const H = 0.5 + 0.3 * lv, p = [V(0, 0, 0, 0.46, H, 0x4f8fc0), Q(0, H, 0, 0.48, 0.03, NEON[0]), S(0, H - 0.02, 0, 0.36, 0.2, 0.36, 0x8fd0f0), B(0, 0, 0, 0.52, 0.04, 0.5, 0x2d4a66)];
      if (lv >= 2) p.push(Q(0, H * 0.55, 0, 0.5, 0.025, NEON[1]));
      if (lv >= 3) p.push(G(0, H + 0.18, 0, 0.03, 0.9, 0.03, NEON[0]), V(0.3, 0, 0.28, 0.2, 0.5, 0x6fb1e0), S(0.3, 0.46, 0.28, 0.2, 0.1, 0.2, 0x8fd0f0));
      return p;
    },
    escola: (lv) => {
      const p = [W(0, 0, 0, 0.7, 0.3, 0.34, 0xf0d58c), B(0, 0.3, 0, 0.74, 0.04, 0.38, 0xc0603a), W(-0.2, 0, 0.3, 0.3, 0.3, 0.2, 0xf0d58c), R(-0.2, 0.3, 0.3, 0.34, 0.15, 0.24, 0xc0603a), B(0.34, 0, 0.3, 0.02, 0.5, 0.02, 0xdddddd), G(0.4, 0.44, 0.3, 0.1, 0.06, 0.01, 0x3d85c6), V(0.2, 0.3, 0, 0.14, 0.22, 0xf0d58c), S(0.2, 0.48, 0, 0.16, 0.12, 0.16, 0xc0603a)];
      if (lv >= 2) p.push(W(0.2, 0.3, 0, 0.3, 0.2, 0.3, 0xf0d58c));
      if (lv >= 3) p.push(W(-0.2, 0.3, 0, 0.3, 0.3, 0.3, 0xf0d58c), W(0.0, 0, -0.38, 0.7, 0.16, 0.16, 0xe6c876));
      return p;
    },
    universidade: (lv) => {
      const p = [W(0, 0, 0, 0.84, 0.34, 0.5, 0xe3d6b8), B(0, 0.34, 0, 0.88, 0.04, 0.54, 0xa39a82), V(0, 0.38, 0, 0.3, 0.16, 0xe3d6b8), S(0, 0.46, 0, 0.34, 0.26, 0.34, 0xe0b94a), B(0, 0.7, 0, 0.012, 0.16, 0.012, 0xdddddd)];
      for (let i = -2; i <= 2; i++) p.push(B(i * 0.16, 0, 0.28, 0.04, 0.3, 0.04, 0xffffff));
      if (lv >= 2) p.push(W(-0.46, 0, 0, 0.26, 0.4, 0.42, 0xe3d6b8));
      if (lv >= 3) p.push(W(0.46, 0, 0, 0.26, 0.5, 0.42, 0xe3d6b8), W(0, 0, -0.4, 0.8, 0.2, 0.16, 0xd2c6a6), Q(0, 0.62, 0, 0.4, 0.02, 0xffd36b));
      return p;
    },
    hospital: (lv) => {
      const hh = 0.4 + 0.22 * (lv - 1), p = [W(0, 0, 0, 0.7, hh, 0.5, 0xf4f6f8), B(0, hh, 0, 0.66, 0.03, 0.46, 0xdfe4e9), G(0.0, hh + 0.03, 0.0, 0.34, 0.02, 0.1, 0xe03b3b), G(0.0, hh + 0.03, 0.0, 0.1, 0.02, 0.34, 0xe03b3b), B(0, 0.06, 0.26, 0.28, 0.16, 0.02, 0x6fa8dc)];
      if (lv >= 2) p.push(W(0.44, 0, 0, 0.24, hh * 0.7, 0.4, 0xe4e8ec));
      if (lv >= 3) p.push(W(-0.44, 0, 0, 0.24, hh * 0.7, 0.4, 0xe4e8ec), C(0.44, hh * 0.7, 0, 0.24, 0.02, 0xdddddd), Q(0.44, hh * 0.7 + 0.02, 0, 0.22, 0.015, 0x7dff9a));
      return p;
    },
    policia: (lv) => {
      const H = 0.3 + 0.1 * (lv - 1), p = [W(0, 0, 0, 0.6, H, 0.46, 0x4a6fa5), B(0, H, 0, 0.64, 0.05, 0.5, 0x2e4a73), W(0.22, H, 0.0, 0.1, 0.2, 0.1, 0x2e4a73), G(0.22, H + 0.2, 0.0, 0.08, 0.05, 0.08, 0xe04b4b), G(0.22, H + 0.25, 0.0, 0.05, 0.03, 0.05, 0x4d8fff), B(-0.12, 0.06, 0.24, 0.22, 0.14, 0.02, 0xdbe7f5)];
      if (lv >= 2) p.push(W(-0.38, 0, 0, 0.22, 0.26, 0.36, 0x4a6fa5));
      if (lv >= 3) p.push(W(0.38, 0, 0, 0.22, 0.34, 0.36, 0x4a6fa5), B(0, 0, 0.42, 0.7, 0.02, 0.1, 0x555b66));
      return p;
    },
    bombeiros: (lv) => {
      const p = [W(0, 0, 0, 0.66, 0.3 + 0.08 * (lv - 1), 0.46, 0xcc3b32), B(-0.15, 0, 0.24, 0.18, 0.2, 0.02, 0x3a3a3a), B(0.15, 0, 0.24, 0.18, 0.2, 0.02, 0x3a3a3a), W(0.3, 0, -0.1, 0.12, 0.62 + 0.15 * lv, 0.12, 0xa42f28), B(0.3, 0.62 + 0.15 * lv, -0.1, 0.16, 0.05, 0.16, 0x7a2a22), G(0.3, 0.68 + 0.15 * lv, -0.1, 0.06, 0.04, 0.06, 0xffb02e)];
      if (lv >= 2) p.push(W(-0.42, 0, 0, 0.22, 0.26, 0.4, 0xcc3b32));
      if (lv >= 3) p.push(B(0, 0.38, 0, 0.5, 0.1, 0.3, 0xe14b42));
      return p;
    },
    parque: (lv) => {
      const p = [C(0.16, 0.0, 0.2, 0.36, 0.025, 0x5ab4e6), B(-0.3, 0, -0.3, 0.3, 0.015, 0.05, 0xd8c79a), O(0.16, 0.025, 0.2, 0.37, 0.05, 0xd8c79a)];
      trees(p, [[-0.3, 0.1, 1.3], [-0.1, -0.3, 1.1], [0.3, -0.25, 1.2], [-0.36, 0.34, 1]].slice(0, 2 + lv));
      if (lv >= 2) p.push(C(0.0, 0, 0, 0.1, 0.14, 0xd8c79a), S(0.0, 0.1, 0, 0.2, 0.1, 0.2, 0xe8d4a4));
      if (lv >= 3) trees(p, [[0.42, 0.42, 1.3], [-0.42, 0.0, 1.4]]);
      return p;
    },
    estadio: (lv) => {
      const H = 0.3 + 0.08 * (lv - 1), p = [O(0, 0.02, 0, 0.84, 0.12 + 0.05 * lv, 0xdcdcdc), O(0, 0.02 + H * 0.5, 0, 0.78, 0.1, 0xc4c4c4), C(0, 0.0, 0, 0.62, 0.05, 0x4fae45), B(0, 0.05, 0, 0.5, 0.01, 0.02, 0xffffff), Q(0, H, 0, 0.8, 0.02, 0xfff0a0)];
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; p.push(B(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42, 0.02, 0.5, 0.02, 0xcccccc), G(Math.cos(a) * 0.42, 0.5, Math.sin(a) * 0.42, 0.07, 0.03, 0.07, 0xfff4b0)); }
      return p;
    },
    agua: (lv) => [S(0, 0.2, 0, 0.44 + 0.06 * lv, 0.4 + 0.08 * lv, 0.44 + 0.06 * lv, 0x7fb6dd), B(-0.12, 0, -0.12, 0.04, 0.24, 0.04, 0x8a8f98), B(0.12, 0, -0.12, 0.04, 0.24, 0.04, 0x8a8f98), B(-0.12, 0, 0.12, 0.04, 0.24, 0.04, 0x8a8f98), B(0.12, 0, 0.12, 0.04, 0.24, 0.04, 0x8a8f98), ...(lv >= 3 ? [S(0.36, 0, 0.3, 0.22, 0.3, 0.22, 0xcfe3f4)] : [])],
    esgoto: (lv) => { const p = [C(-0.18, 0, 0, 0.4, 0.1, 0x8a7a5a), C(0.2, 0, 0.1, 0.34, 0.14, 0x6f8a5a), S(0.2, 0.1, 0.1, 0.3, 0.1, 0.3, 0x7a9a6a), B(0.0, 0, -0.34, 0.7, 0.14, 0.14, 0xa0a6ad)]; if (lv >= 2) p.push(C(0.2, 0, -0.1, 0.2, 0.2, 0x6f8a5a)); if (lv >= 3) p.push(C(-0.3, 0, 0.3, 0.26, 0.18, 0x8a7a5a)); return p; },
    solar: (lv) => { const p = []; for (let i = 0; i < 2 + lv; i++) { const z = -0.32 + i * (0.64 / (1 + lv)); p.push(B(0, 0.1, z, 0.7, 0.03, 0.16, 0x1e3a6e), G(0, 0.13, z, 0.7, 0.004, 0.012, 0x6fc7ff), B(0, 0.0, z, 0.04, 0.1, 0.04, 0x888888)); } return p; },
    eolica: (lv) => {
      const hgt = 0.7 + 0.2 * lv, p = [C(0, 0, 0, 0.07, hgt, 0xf1f1f1), B(0, hgt - 0.03, 0.04, 0.08, 0.08, 0.14, 0xdedede)];
      if (lv >= 3) p.push(C(0.34, 0, 0.3, 0.05, 0.6, 0xf1f1f1));
      return p;
    },
    carvao: (lv) => [W(0, 0, 0, 0.7, 0.28, 0.4, 0x4a4a52), C(-0.2, 0, -0.2, 0.26 + 0.04 * lv, 0.5 + 0.12 * lv, 0x6c6c75), C(-0.2, 0.5 + 0.12 * lv, -0.2, 0.2 + 0.03 * lv, 0.06, 0x3a3a40), C(0.18, 0, -0.2, 0.26 + 0.04 * lv, 0.5 + 0.12 * lv, 0x6c6c75), C(0.18, 0.5 + 0.12 * lv, -0.2, 0.2 + 0.03 * lv, 0.06, 0x3a3a40), B(0.0, 0, 0.3, 0.7, 0.05, 0.18, 0x222222), ...(lv >= 3 ? [C(0.36, 0, 0.1, 0.2, 0.8, 0x4a4a52)] : [])],
    filtro: (lv) => [W(0, 0, 0, 0.4, 0.2, 0.4, 0x8aa0b3), C(0.0, 0.2, 0, 0.18, 0.5 + 0.1 * lv, 0xb5c7d6), S(0.0, 0.66 + 0.1 * lv, 0, 0.2, 0.1, 0.2, 0xcfe0ec), C(-0.26, 0, 0.2, 0.14, 0.34, 0x9fb4c5), ...(lv >= 2 ? [C(0.26, 0, 0.2, 0.14, 0.4, 0x9fb4c5)] : []), ...(lv >= 3 ? [W(0, 0, -0.34, 0.6, 0.12, 0.14, 0x8aa0b3), Q(0, 0.5, 0, 0.22, 0.02, 0x7dff9a)] : [])],
    floresta: (lv) => { const p = []; trees(p, [[-0.28, -0.25, 1.5], [0.2, -0.3, 1.2], [0.0, 0.0, 1.7], [-0.3, 0.25, 1.3], [0.3, 0.2, 1.5], [0.1, 0.4, 1.1], [-0.05, -0.4, 1.0]].slice(0, 4 + lv * 1), 1.2); return p; },
    reciclagem: (lv) => [W(0, 0, 0, 0.7, 0.26 + 0.1 * (lv - 1), 0.46, 0x6fbf73), B(0.0, 0.26 + 0.1 * (lv - 1), 0, 0.74, 0.04, 0.5, 0x3f8f50), G(-0.3, 0.02, 0.32, 0.2, 0.14, 0.14, 0x7dff9a), B(0.25, 0, 0.32, 0.3, 0.06, 0.14, 0x555b66), C(0.28, 0, -0.3, 0.1, 0.4, 0x4a8a58), Q(0.0, 0.3 + 0.1 * (lv - 1), 0, 0.5, 0.015, 0x7dff9a)],
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
    const sph = new T.SphereGeometry(0.5, 14, 10); sph.translate(0, 0.5, 0);
    const tor = new T.TorusGeometry(0.5, 0.06, 8, 28); tor.rotateX(Math.PI / 2); tor.translate(0, 0.06, 0);
    geoms = {b: box, c: cyl, r: pyr, t: cone, s: sph, o: tor, w: box, v: cyl, g: box, q: tor};
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    sunL.castShadow = true; sunL.shadow.mapSize.set(2048, 2048); sunL.shadow.bias = -0.0006; scene.add(sunL.target);
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
  let tmp = null, lay0 = null, trains = [];
  const T_ = () => tmp || (tmp = {m4: M4(), q: new root.THREE.Quaternion(), e: new root.THREE.Euler(), v: V3(), sc: V3(), col: new root.THREE.Color()});

  // Janelas: o desenho (vidro escuro e luzes que acendem de noite) é feito no próprio material, sem textura nem peças extras
  const nightU = {value: 0}, winScaleU = {value: 1};
  function windowMat(cyl) {
    const T = root.THREE, m = new T.MeshPhongMaterial({color: 0xffffff, shininess: 55, specular: 0x39424f});
    m.onBeforeCompile = sh => {
      sh.uniforms.uNight = nightU; sh.uniforms.uWin = winScaleU;
      sh.vertexShader = 'varying vec3 vLoc; varying vec3 vNl;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vLoc = position * isc; vNl = normal;`);
      sh.fragmentShader = 'uniform float uNight; uniform float uWin; varying vec3 vLoc; varying vec3 vNl; float wLit = 0.0;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 nl = normalize(vNl);
        if (abs(nl.y) < 0.5) {
          ${cyl ? 'float u = atan(vLoc.z, vLoc.x) * 0.5 * max(abs(vLoc.x), 0.05) * 2.0;' : 'float u = abs(nl.x) > abs(nl.z) ? vLoc.z : vLoc.x;'}
          vec2 cell = vec2(u / (0.11 * uWin), vLoc.y / (0.12 * uWin)); vec2 f = fract(cell); vec2 id = floor(cell);
          float wm = step(0.16, f.x) * step(f.x, 0.84) * step(0.2, f.y) * step(f.y, 0.8);
          float r = fract(sin(dot(id + nl.xz * 3.1, vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.26, 0.38) * (0.8 + 0.5 * r), wm * 0.8);
          wLit = wm * step(0.42, r);
        }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.8, 0.42) * wLit * uNight * 0.9;`);
    };
    return m;
  }
  function newItems() { return {b: [], c: [], r: [], t: [], s: [], o: [], w: [], v: [], g: [], q: [], lamp: []}; }
  function buildMeshes(items) {
    const T = root.THREE;
    ['b', 'c', 'r', 't', 's', 'o', 'w', 'v', 'g', 'q'].forEach(k => {
      const mat = k === 'w' ? windowMat(false) : k === 'v' ? windowMat(true) : (k === 'g' || k === 'q') ? new T.MeshBasicMaterial({color: 0xffffff}) : new T.MeshLambertMaterial({color: 0xffffff});
      const m = makeInst(geoms[k], items[k], mat); if (m) { m.castShadow = k !== 'g' && k !== 'q'; m.receiveShadow = true; meshes.push(m); }
    });
    const lm = makeInst(geoms.b, items.lamp, new T.MeshBasicMaterial({color: 0xffffff})); if (lm) meshes.push(lm);
  }
  function fitShadow(cx, cz, span) {
    const c = sunL.shadow.camera, r = span * 0.8 + 3; c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 120; c.updateProjectionMatrix();
    sunL.target.position.set(cx, 0, cz); sunL.target.updateMatrixWorld();
  }
  function disposeMesh(m) { scene.remove(m); if (m.material) m.material.dispose(); if (m.dispose) m.dispose(); }
  function clearScene() {
    meshes.forEach(disposeMesh); meshes = []; dyn.forEach(disposeMesh); dyn = []; if (clouds) { disposeMesh(clouds); clouds = null; }
    if (ground) { scene.remove(ground); ground.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); }); ground = null; }
    cars = []; walkers = []; smoke = []; turbines = []; boats = []; trains = [];
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
    const items = newItems(); winScaleU.value = 1;
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
    // monotrilho elevado cortando a cidade (só em cidades já grandes)
    lay0 = null;
    if (built >= 25) {
      const mx = xs[Math.floor(xs.length / 2)], mz = zs[Math.floor(zs.length / 2)], lx = (minx - 1) * PITCH, hx = (maxx + 1) * PITCH, lz = (minz - 1) * PITCH, hz = (maxz + 1) * PITCH;
      const cz2 = (lz + hz) / 2, cx2 = (lx + hx) / 2;
      items.b.push([mx, 0.62, cz2, 0.14, 0.04, hz - lz, 0x8d97a6, 0, 0]); items.g.push([mx, 0.605, cz2, 0.05, 0.012, hz - lz, 0x4de3ff, 0, 0]);
      items.b.push([cx2, 0.86, mz, hx - lx, 0.04, 0.14, 0x8d97a6, 0, 0]); items.g.push([cx2, 0.845, mz, hx - lx, 0.012, 0.05, 0xff5ad1, 0, 0]);
      for (let z = lz; z <= hz; z += PITCH * 2) items.c.push([mx, 0, z, 0.06, 0.62, 0.06, 0x9aa3b0, 0, 0]);
      for (let x = lx; x <= hx; x += PITCH * 2) if (Math.abs(x - mx) > PITCH * 0.6) items.c.push([x, 0, mz, 0.06, 0.86, 0.06, 0x9aa3b0, 0, 0]);
      lay0 = [{alongZ: true, line: mx, y: 0.66, lo: lz, hi: hz}, {alongZ: false, line: mz, y: 0.9, lo: lx, hi: hx}];
    }
    buildMeshes(items);
    // chão: gramado enorme (some na neblina) e o asfalto só onde tem rua
    const gw = (maxx - minx + 4) * PITCH, gd = (maxz - minz + 4) * PITCH, cx = (minx + maxx) / 2 * PITCH, cz = (minz + maxz) / 2 * PITCH;
    ground = new T.Group();
    const terrain = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshLambertMaterial({color: 0x3f7a35})); terrain.rotation.x = -Math.PI / 2; terrain.position.set(cx, -0.02, cz);
    const asphalt = new T.Mesh(new T.PlaneGeometry(gw - 2 * PITCH + 0.6, gd - 2 * PITCH + 0.6), new T.MeshLambertMaterial({color: ROAD})); asphalt.rotation.x = -Math.PI / 2; asphalt.position.set(cx, 0.005, cz);
    terrain.receiveShadow = true; asphalt.receiveShadow = true; ground.add(terrain, asphalt); scene.add(ground);
    lay = {minx: (minx - 1) * PITCH, maxx: (maxx + 1) * PITCH, minz: (minz - 1) * PITCH, maxz: (maxz + 1) * PITCH, xs, zs};
    view.tx = cx; view.tz = cz;
    view.span = Math.max(maxx - minx, maxz - minz) * PITCH + 3;
    if (!view.touched) view.dist = fitDist();
    fitShadow(cx, cz, view.span);
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
    const items = newItems(), R = 8.5; winScaleU.value = 0.34;
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
      const sc = sim.cities[n.key], r = (info.nation ? 1.7 : 1.1) + Math.min(0.7, info.pop / 30000);
      island(x, z, r, 0xe7d9a8, info.nation ? 0x6aa84f : 0x5d9c4a);
      mini(sc.tiles, sc.lv, x, z, 0.34, 0.26, info.nation ? 80 : 45);
      flag(x, z + r * 0.78, info.nation ? 0.75 : 0.5, info.nation ? 0xf4b942 : 0x3d85c6);
    });
    buildMeshes(items);
    const sea = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshLambertMaterial({color: 0x1f6f9f})); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.06;
    sea.receiveShadow = true; ground = new T.Group(); ground.add(sea); scene.add(ground); fitShadow(0, 0, (R + 5.5) * 2);
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
    (lay0 || []).forEach((r, j) => { for (let q = 0; q < 2; q++) trains.push({...r, dir: q ? -1 : 1, speed: 0.9 + 0.2 * j, t: r.lo + (q ? 0.7 : 0.2) * (r.hi - r.lo)}); });
    if (trains.length) {
      trains.mesh = [dynMesh(geoms.b, trains.length * 3), dynMesh(geoms.g, trains.length * 3, true)];
      trains.forEach((tr, i) => { for (let c = 0; c < 3; c++) { trains.mesh[0].setColorAt(i * 3 + c, k.col.setHex(c === 0 ? 0xe9eef5 : 0xdfe6ee)); trains.mesh[1].setColorAt(i * 3 + c, k.col.setHex(tr.alongZ ? 0x4de3ff : 0xff5ad1)); } });
      trains.mesh.forEach(m => { m.instanceColor.needsUpdate = true; });
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
    if (trains.mesh) {
      const [bd, gl] = trains.mesh; trains.forEach((tr, i) => {
        tr.t += tr.dir * tr.speed * dt; if (tr.t > tr.hi) tr.t = tr.lo; else if (tr.t < tr.lo) tr.t = tr.hi;
        for (let c = 0; c < 3; c++) {
          const off = tr.t - tr.dir * c * 0.62, x = tr.alongZ ? tr.line : off, z = tr.alongZ ? off : tr.line;
          e.set(0, tr.alongZ ? Math.PI / 2 : 0, 0); q.setFromEuler(e);
          v.set(x, tr.y, z); sc.set(0.58, 0.12, 0.18); m4.compose(v, q, sc); bd.setMatrixAt(i * 3 + c, m4);
          v.set(x, tr.y + 0.05, z); sc.set(0.5, 0.025, 0.2); m4.compose(v, q, sc); gl.setMatrixAt(i * 3 + c, m4);
        }
      });
      bd.instanceMatrix.needsUpdate = true; gl.instanceMatrix.needsUpdate = true;
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
    return Math.max(6, span * (asp >= 1 ? 1.05 : 1.05 / Math.max(0.35, asp) * 0.78) * (mode === 'world' ? (asp >= 1 ? 0.78 : 1.15) : 1));
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
    nightU.value = Math.max(0, 1 - d * 1.6);
    if (sunL) { sunL.intensity = 0.12 + 0.85 * d; sunL.color.set(new T.Color(0xff9a5a).lerp(new T.Color(0xfff0d0), Math.min(1, d * 1.4))); sunL.position.set(view.tx - 8 * (0.4 + d) - 4, 9 + 8 * d, view.tz + 7); sunL.target.position.set(view.tx, 0, view.tz); sunL.target.updateMatrixWorld(); renderer.shadowMap.needsUpdate = true; }
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
      else if (focus === 'world') next = 'w|' + s.tiles.filter(Boolean).length + '|' + Math.round(Math.log10(1 + s.pop) * 4) + '|' + S.NEIGHBORS.map(n => { const i = S.colonyInfo(s, n.key); return i.owned ? Math.round(Math.log10(1 + i.pop) * 4) + (i.nation ? 'N' : 'c') : '-'; }).join('');
      else next = 'k|' + focus + '|' + s.cities[focus].tiles.length + '|' + s.cities[focus].lv.join('') + '|' + info.nation;
      if (focus !== focusNow) { focusNow = focus; view.touched = false; sig = ''; }
      state = focus === 'capital' ? S.analyze(s) : null;
      if (next !== sig) {
        sig = next;
        if (focus === 'capital') rebuild(s); else if (focus === 'world') rebuildWorld(s); else rebuild(s.cities[focus]);
        applySky();
      }
      resize(); dirty = true; schedule();
    },
    hide() { if (raf) cancelAnimationFrame(raf); raf = 0; host = null; boundTo = null; if (ro) { ro.disconnect(); ro = null; } if (renderer && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); },
    _spiral: spiral, _parts: BUILD, _cars: () => cars, _synth: synthCity, _mode: () => mode, view,
  };
  root.City3D = City3D;
})(typeof window !== 'undefined' ? window : globalThis);
