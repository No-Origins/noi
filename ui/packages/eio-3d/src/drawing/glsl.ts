// The drawing code that runs on the graphics card (GLSL), moved from the 3D world page
// (worktree studio-3d-world-9bd994, Planning/studio-3d/world.html, as it stood at its decision 65,
// 17 Nov 2026). Copied as written, comments and all, so an element draws here exactly as it does
// there. Colours and sizes are not in here: they come in as uniforms, from Eidos.
//
// LINES: how much of a point a line of a grid covers.
// EDGE: THE ONE RULE FOR THE EDGE OF THE WORLD, and the field of circles. Every painter of a thing on
//   the land includes it and asks goneAt(); nothing else decides where things dissolve (the user's
//   rule, 17 Nov).
// VERT, FRAG: the ground: the land, its circles, its edge, and the water painted on it.
// VERT_S, FRAG_S: solid things (the arch, its block, the steps, the wall, a gateway's walls).
// FRAG_F: one plain colour (an arch's opening, the dark behind it, and here the measure lines).

export const LINES = [
  'float lines(vec2 p, float width){',
  '  vec2 d = max(fwidth(p), vec2(1e-5));',
  '  vec2 dist = abs(fract(p + 0.5) - 0.5);',
  '  vec2 hw = max(vec2(width*0.5), d*0.5);',
  '  vec2 cov = 1.0 - smoothstep(hw - d*0.5, hw + d*0.5, dist);',
  '  cov *= clamp(vec2(width*0.5)/hw, 0.0, 1.0);',
  '  cov = mix(cov, vec2(width), clamp(d*2.0 - 1.0, 0.0, 1.0));',
  '  return 1.0 - (1.0 - cov.x)*(1.0 - cov.y);',
  '}'
].join('\n')

export const EDGE = [
  'uniform vec2 uEdge;',                     // from the world's middle: where things begin to dissolve, and where nothing is left
  'uniform float uRound;',                   // 1: the world's edge is a circle. 0: a square.
  'uniform float uDots;',                    // 1: a grain of dust is a round dot. 0: a square.
  'uniform vec3 uField;',                    // the land's circles: where the first row's middle line is; half the place each circle is given; and the circle's own size, middle to line
  // CHANGED IN EIDOS (17 Nov): the circle's dash and line, which the world page wrote here, come from Eidos
  // (noi.eio.world.circles.dash and .line): how long a dash and its gap are, each; how thick the line is.
  'uniform vec2 uCircle;',
  'uniform vec3 uSteps;',                    // where the steps begin, and where the top one begins (from the pool's middle); and 1 when it is the steps that are being painted, 0 for the ground
  // a number between 0 and 1 for each grain, the same every time
  'float grain(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }',
  // the same, but changing smoothly from place to place: it makes the line uneven
  'float soft(vec2 p){',
  '  vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);',
  '  return mix(mix(grain(i), grain(i + vec2(1.0, 0.0)), f.x), mix(grain(i + vec2(0.0, 1.0)), grain(i + vec2(1.0, 1.0)), f.x), f.y);',
  '}',
  // a fixed pattern of 16 steps over the dots of the screen: it turns "half there" into every other dot
  'float screenStep(vec2 f){',
  '  ivec2 p = ivec2(mod(f, 4.0));',
  '  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);',
  '  return (float(m[p.y*4 + p.x]) + 0.5)/16.0;',
  '}',
  // how far gone a place is. Height does not matter: a tall thing dissolves along the same line as the ground under it.
  'float goneAt(vec2 p){',
  '  float e = mix(max(abs(p.x), abs(p.y)), length(p), uRound) + (soft(p*0.035) - 0.9)*14.0 + (soft(p*0.12) - 0.5)*4.0;',
  '  return clamp((e - uEdge.x)/(uEdge.y - uEdge.x), 0.0, 1.0);',
  '}',
  // Is this grain of a face still there? A face is cut into squares ("grains"); the further gone
  // the place, the fewer are left. From far away, where a grain is smaller than a dot of the
  // screen, the right share of dots is kept instead.
  'bool grainLeft(vec2 onFace, float gone, float size){',
  '  float keep = pow(1.0 - gone, 1.5);',
  '  vec2 q = onFace/size;',
  // A grain is round (uDots): it fills its whole square while nothing is gone, so a whole face has
  // no holes, and it shrinks to a round dot as the place goes.
  '  float rad = mix(0.75, 0.36, smoothstep(0.0, 0.3, gone)*uDots);',
  '  float inDot = step(length(fract(q) - 0.5), rad);',
  '  vec2 fq = fwidth(q);',
  '  float share = mix(step(grain(floor(q)), keep)*inDot, keep*min(1.0, 3.14159*rad*rad), smoothstep(0.4, 1.2, max(fq.x, fq.y)));',
  '  return share > screenStep(gl_FragCoord.xy);',
  '}',
  // THE LAND'S WAY OF DISSOLVING, for the ground and for the steps alike. The land is black on a
  // black sky, so black grains dropping away would show nothing. Instead its lines break up, and
  // loose grains of grey dust lie about, fewer and fewer the further gone the place.
  // From far away the loose grains are spread over the dots of the screen at random (not in the
  // fixed pattern above), so that they still show through another thing that is itself dissolving.
  'vec3 landDust(vec3 col, vec3 bare, vec3 dustCol, vec2 onFace, float gone, float size){',
  '  float keep = pow(1.0 - gone, 1.5);',
  '  vec2 q = onFace/size;',
  '  vec2 fq = fwidth(q);',
  '  float far = smoothstep(0.4, 1.2, max(fq.x, fq.y));',
  '  col = mix(bare, col, mix(step(grain(floor(q)), keep), keep, far));',
  '  float much = 0.27*keep*smoothstep(0.0, 0.22, gone);',
  '  float inDot = mix(1.0, step(length(fract(q) - 0.5), 0.40), uDots);',          // a loose grain is a round dot too
  '  float share = mix(step(grain(floor(q) + 17.0), much)*inDot, much*mix(1.0, 0.5, uDots), far);',
  '  return share > grain(floor(gl_FragCoord.xy)*0.731 + 3.7) ? dustCol : col;',
  '}',
  // THE FIELD OF CIRCLES (17 Nov). The land carries no grid lines. It carries circles, in rows round
  // the pool: a row is a ring of circles, as many as fit round it, spaced evenly, one of them
  // straight ahead; row after row, out to the edge of the world. Each circle is drawn the way the
  // old project's field drew its cells: a thin ring in short even dashes, one dash at its top.
  // A circle is never thinner than a dot of the screen; far away its dashes settle into a faint line.
  // Gives back how much of this point is a circle's line, and in `cell`: the row, the number in the
  // row, and how far the point is from that circle's middle (1 on its line).
  'float field(vec2 p, out vec3 cell){',
  // Each circle is given a place (room across, twice over), and is drawn smaller than its place,
  // so that there is space between circles and between rows.
  '  float room = uField.y, rad = uField.z, r = length(p);',
  '  float row = floor((r - uField.x)/(2.0*room) + 0.5);',
  '  cell = vec3(-1.0, -1.0, 9.0);',
  '  if (row < 0.0) return 0.0;',                                               // none on the water or on its rim
  '  float R = uField.x + row*2.0*room;',                                       // this row's middle line
  '  float n = floor(3.14159265*R/room);',                                      // how many places fit round it
  '  float k = floor(atan(p.x, -p.y)/6.2831853*n + 0.5);',                      // which circle of the row; 0 is straight ahead
  '  float ac = k*6.2831853/n;',
  '  vec2 c = R*vec2(sin(ac), -cos(ac));',                                      // this circle's middle
  // THE STEPS CARRY NO CIRCLES (the user's word, 17 Nov): what you step on is plain black. A circle is
  // drawn only where the whole of it lies on one level: on the ground, clear of the steps (they are
  // behind the pool); or on the top step, clear of the steps below it and of its two straight ends.
  // A circle that a step would cut in two is left out.
  '  bool left = uSteps.z > 0.5 ? !(c.y < -rad && R - rad >= uSteps.y) : (c.y < rad && R + rad > uSteps.x);',
  '  if (left) return 0.0;',
  '  vec2 d = p - c;',
  '  float dist = length(d);',
  '  cell = vec3(row, mod(k + n, n), dist/rad);',
  '  float fp = max(max(fwidth(p.x), fwidth(p.y)), 1e-5);',                     // one dot of the screen, in metres
  '  float width = uCircle.y;',
  '  float hw = max(width*0.5, fp*0.5);',
  '  float line = (1.0 - smoothstep(hw - fp*0.5, hw + fp*0.5, abs(dist - rad)))*clamp(width*0.5/hw, 0.4, 1.0);',
  '  float nd = max(8.0, floor(3.14159265*rad/max(uCircle.x, 0.01) + 0.5));',   // dashes round one circle: each as long as a dash (Eidos)
  '  float t = fract(atan(d.x, -d.y)/6.2831853*nd + 0.5);',
  '  float ft = nd*fp/(6.2831853*rad);',
  '  float on = smoothstep(0.25 - ft, 0.25 + ft, t)*(1.0 - smoothstep(0.75 - ft, 0.75 + ft, t));',
  '  return line*mix(on, 0.5, clamp(ft*3.0 - 0.5, 0.0, 1.0));',
  '}'
].join('\n')

export const VERT_S = [
  '#version 300 es',
  'layout(location=0) in vec3 aPos;',
  'layout(location=1) in vec3 aNor;',
  'layout(location=2) in vec4 aFace;',       // where on the face (two numbers), and the face's size (two numbers), in tiles
  'layout(location=3) in vec4 aEdge;',       // which of the face's four borders are edges of the shape
  'uniform mat4 uVP;',
  'uniform vec3 uOff;',
  'uniform vec2 uTurn;',                     // the angle, as its cosine and sine
  'out vec3 vWorld; out vec3 vNor; out vec4 vFace; out vec4 vEdge;',
  // a shape's own "ahead" is away from the entry
  'vec3 turn(vec3 v){ return vec3(uTurn.x*v.x + uTurn.y*v.z, v.y, uTurn.y*v.x - uTurn.x*v.z); }',
  'void main(){',
  '  vec3 w = turn(aPos) + uOff;',
  '  vWorld = w; vNor = turn(aNor); vFace = aFace; vEdge = aEdge;',
  '  gl_Position = uVP*vec4(w, 1.0);',
  '}'
].join('\n')

export const FRAG_S = [
  '#version 300 es',
  'precision highp float;',
  'in vec3 vWorld; in vec3 vNor; in vec4 vFace; in vec4 vEdge;',
  'uniform vec3 uEye, uVoid, uBody, uEdgeCol, uGlow, uTileLine, uTileStrong, uPocket, uDustCol;',
  'uniform float uFogNear, uFogFar, uOn, uOver, uEdgeW, uEdges, uTiles, uStrongEvery, uDeep, uGrain, uFlat;',
  // A SYSTEM'S GATEWAY WHILE CLAY FLIES IN (17 Nov): 1 when it is; how deep into it Clay is (from the door);
  // how thin its dust gets at most; and 1 while the lime ripples run
  'uniform vec4 uGate;',
  // THE LIME RIPPLES (17 Nov): the space between two ripples (metres); how far they have run (metres, starting
  // again each ripple); how long a ripple's tail is; and how far ahead of Clay they fade out
  'uniform vec4 uWave;',
  // CHANGED IN EIDOS (17 Nov): how far behind the character the ripples start, which the world page wrote
  // here as 40 metres, comes from Eidos (noi.eio.world.ripples.behind); they fade in over 12 metres from there.
  'uniform float uWaveBehind;',
  EDGE,
  'out vec4 outColor;',
  LINES,
  'void main(){',
  '  vec3 n = normalize(vNor);',
  // one light, always from the same side of the world: the top is lightest
  // Near the edge of the world a thing dissolves into dust, by the same rule as the land under it.
  // The steps are land (uFlat): they dissolve the land's way, further down, and are dropped only
  // where nothing is left. Every other thing loses its grains.
  '  float gone = uDeep > 0.5 ? 0.0 : goneAt(vWorld.xz);',                       // a tunnel is not on the land: the edge of the world does not reach into it
  '  if (uFlat > 0.5 ? gone >= 1.0 : (gone > 0.0 && !grainLeft(vFace.xy, gone, uGrain))) discard;',
  // inside a tunnel a wall dissolves into dust the deeper it goes: whole at the door, nothing left uDeep further in
  '  float depth = dot(vWorld.xz, uPocket.xy) - uPocket.z;',                    // how far behind the door, into the tunnel
  '  float thin = clamp(depth/max(uDeep, 1.0), 0.0, 1.0);',
  // While Clay flies into a system its gateway does not end: past the first stretch it goes on as a steady thin dust.
  '  if (uGate.x > 0.5) thin = min(thin, uGate.z);',
  // THE LIME RIPPLES (the user, 17 Nov: "the lime color rippling from behind to into the gateway continuously
  // with the gap of 0.3 seconds"; then, to try, "a difference of 1 second"). Rings of lime run along the gateway's
  // dust from behind Clay, past him and on into the gateway, one every WAVE_GAP seconds (1 now). A ripple has a sharp front and a tail that fades behind it; it
  // gathers more dust than the wall around it, so it shows as a ring. They start 40 metres behind him and fade
  // out uWave.w metres ahead. Between ripples the dust is white; where the wall is still whole, near the door, it
  // stays white: only the dust turns.
  '  float ring = 0.0;',
  '  if (uGate.x > 0.5 && uGate.w > 0.5){',
  '    float r = depth - uGate.y;',                                                 // how far ahead of Clay (behind him below 0)
  '    float f = fract((r - uWave.y)/uWave.x);',                                     // where in its ripple: 1 at a front
  '    ring = smoothstep(1.0 - uWave.z/uWave.x, 1.0, f)*smoothstep(-uWaveBehind, -uWaveBehind + 12.0, r)*(1.0 - smoothstep(uWave.w*0.45, uWave.w, r))*smoothstep(0.03, 0.3, thin);',
  '  }',
  '  if (uDeep > 0.5 && !grainLeft(vFace.xy, thin*(1.0 - 0.55*ring), uGrain)) discard;',
  '  float light = 0.72 + 0.30*max(dot(n, normalize(vec3(0.45, 0.80, 0.30))), 0.0);',
  // and a little light from the pool, on what is turned toward it
  '  light += 0.10*max(dot(n, normalize(vec3(0.0, 3.0, 0.0) - vWorld)), 0.0);',
  '  if (uFlat > 0.5) light = 1.0;',                                             // the land is one black, whichever way a face is turned
  '  vec3 col = uBody*light;',
  '  col += uOver*0.035;',
  // stone that is walked on carries tiles: the ground's own (1), or measured from the face itself (2)
  '  if (uTiles > 0.5 && n.y > 0.5){',
  '    vec3 cell;',
  '    col = mix(col, uTileStrong, field(vWorld.xz, cell));',
  '  }',
  // edges are painted only where a shape asks for them. An arch asks for none: it is one plain block.
  '  if (uEdges > 0.5){',
  '    vec2 uv = vFace.xy, sz = vFace.zw;',
  '    vec2 d = max(fwidth(uv), vec2(1e-5));',
  '    vec4 dd = vec4(d.x, d.x, d.y, d.y);',
  '    vec4 dist = vec4(uv.x, sz.x - uv.x, uv.y, sz.y - uv.y);',
  '    vec4 w4 = max(vec4(uEdgeW), dd);',                                        // an edge is never thinner than one dot
  '    vec4 cov = (1.0 - smoothstep(w4 - dd, w4, dist))*vEdge;',
  '    float edge = max(max(cov.x, cov.y), max(cov.z, cov.w));',
  '    col = mix(col, mix(uEdgeCol, uGlow, uOn), edge*0.6);',
  '  }',
  '  if (uFlat > 0.5 && gone > 0.0) col = landDust(col, uBody, uDustCol, vFace.xy, gone, uGrain);',
  '  col = mix(col, uGlow, uOn*mix(0.24, 0.07, uEdges));',
  '  col = mix(col, uGlow*1.15, ring);',                                           // the ripples (above): lime, a little brighter than the dust
  '  float fog = smoothstep(uFogNear, uFogFar, length(vWorld - uEye));',
  // inside a tunnel things fade into the dark the deeper they are. In a gateway in flight, the deeper they are
  // ahead of the eye, and a little further off: so the dark keeps its distance as Clay and the eye go on.
  '  float eyeDepth = uGate.x > 0.5 ? max(dot(uEye.xz, uPocket.xy) - uPocket.z, 0.0) : 0.0;',
  '  float fogIn = uGate.x > 0.5 ? uDeep*0.12 : uDeep*0.10, fogOut = uGate.x > 0.5 ? uDeep*1.3 : uDeep*0.85;',
  '  if (uDeep > 0.5) fog = max(fog, smoothstep(fogIn, fogOut, depth - eyeDepth));',
  '  outColor = vec4(mix(col, uVoid, fog), 1.0);',
  '}'
].join('\n')

export const FRAG_F = [
  '#version 300 es',
  'precision highp float;',
  'in vec3 vWorld; in vec3 vNor; in vec4 vFace; in vec4 vEdge;',
  'uniform vec3 uColor;',
  'out vec4 outColor;',
  'void main(){ outColor = vec4(uColor, 1.0); }'
].join('\n')

export const VERT = [
  '#version 300 es',
  'in vec2 aPos;',
  'uniform mat4 uVP;',
  'uniform float uHalf;',
  'out vec3 vWorld;',
  'void main(){',
  '  vec3 w = vec3(aPos.x*uHalf, 0.0, aPos.y*uHalf);',
  '  vWorld = w;',
  '  gl_Position = uVP*vec4(w, 1.0);',
  '}'
].join('\n')

export const FRAG = [
  '#version 300 es',
  'precision highp float;',
  'in vec3 vWorld;',
  'uniform vec3 uEye;',
  'uniform float uHalf, uLineW, uStrongEvery, uFogNear, uFogFar, uLook, uTime, uPoolOn, uGrain;',
  'uniform vec3 uVoid, uTile, uTileUp, uLine, uStrong, uGlow, uWater, uWaterDeep, uPool, uDustCol;',
  EDGE,
  'uniform sampler2D uRefl;',                // the world turned over, drawn first: what the water mirrors
  'uniform vec2 uView;',                     // the size of the picture, in dots
  'uniform float uMirror;',                  // 1 when that mirror picture was drawn
  'uniform vec2 uHover, uPicked;',
  'uniform float uHasHover, uHasPicked;',
  'out vec4 outColor;',
  LINES,
  'void main(){',
  '  vec2 p = vWorld.xz;',
  '  vec2 d = max(fwidth(p), vec2(1e-5));',
  '  float aa = max(d.x, d.y);',
  // the land is black, and carries rows of circles round the pool
  '  vec3 col = uTile;',
  '  vec3 cell;',
  '  float f = field(p, cell);',
  '  col = mix(col, uStrong, f);',
  // the circle under the pointer, and the circle that was tapped: its dashes light, as the old project lit a cell
  '  if (uHasHover > 0.5 && all(equal(cell.xy, uHover))) col = mix(col, uGlow, f*0.55);',
  '  if (uHasPicked > 0.5 && all(equal(cell.xy, uPicked))) col = mix(col, uGlow, max(f, cell.z < 1.0 ? 0.07 : 0.0));',
  // The land has no hard edge: it asks the one rule how far gone this place is. Its circles break
  // up first; loose grains lie about, fewer and fewer the further out.
  '  float gone = goneAt(p);',
  '  if (gone > 0.0) col = landDust(col, uTile, uDustCol, p, gone, uGrain);',
  // the water. Slow rings go out from its middle.
  '  float rp = length(p - uPool.xy);',
  '  if (rp < uPool.z + aa){',
  // THE WATER (17 Nov). Its surface is small waves crossing each other, and slow rings going out
  // from the middle. Only their slope is needed: it tips the mirror, and it catches the light.
  '    float t = uTime;',
  '    vec2 slope = vec2(0.0);',
  '    slope += 0.045*vec2( 0.92,  0.39)*cos(dot(p, vec2( 0.92,  0.39))*1.70 + t*1.3);',
  '    slope += 0.040*vec2(-0.47,  0.88)*cos(dot(p, vec2(-0.47,  0.88))*2.30 - t*1.7);',
  '    slope += 0.030*vec2( 0.31, -0.95)*cos(dot(p, vec2( 0.31, -0.95))*3.90 + t*2.3);',
  '    slope += 0.022*vec2(-0.81, -0.59)*cos(dot(p, vec2(-0.81, -0.59))*6.10 - t*3.1);',
  '    slope += 0.050*normalize(p - uPool.xy + 1e-4)*cos(rp*1.3 - t*0.9)*smoothstep(0.5, 4.0, rp);',
  '    slope *= 1.0 - smoothstep(0.0, 0.9, aa);',                                // far away the ripples are too small to see: a calm mirror
  '    vec3 nw = normalize(vec3(-slope.x, 1.0, -slope.y));',
  '    vec3 toEye = normalize(uEye - vWorld);',
  // water mirrors more, the more level you look across it; looking straight down you see into it
  '    float mirrorShare = 0.04 + 0.96*pow(1.0 - max(dot(nw, toEye), 0.0), 5.0);',
  '    vec2 at = gl_FragCoord.xy/uView + slope*vec2(0.5, 0.9)*clamp(8.0/length(uEye - vWorld), 0.02, 1.0);',
  '    vec3 seen = uMirror > 0.5 ? textureLod(uRefl, at, 0.0).rgb : uVoid;',     // the world turned over, as the water shows it
  '    float inner = 1.0 - smoothstep(0.0, uPool.z, rp);',
  '    vec3 deep = mix(uWaterDeep, uWater, 0.18 + 0.30*inner);',                 // the water's own colour
  '    deep *= 0.86 + 1.9*dot(slope, vec2(0.45, 0.30));',                        // slopes turned to the light are a little lighter
  '    float glint = pow(max(dot(nw, normalize(normalize(vec3(0.45, 0.80, 0.30)) + toEye)), 0.0), 260.0);',   // the light itself, caught on a ripple
  '    vec3 water = mix(deep, seen, mirrorShare) + vec3(0.9)*glint;',
  '    water = mix(water, uGlow, uPoolOn*0.12);',
  '    col = mix(water, col, smoothstep(uPool.z - aa, uPool.z + aa, rp));',
  '  }',
  // far tiles sink into the dark
  '  float fog = smoothstep(uFogNear, uFogFar, length(vWorld - uEye));',
  '  outColor = vec4(mix(col, uVoid, fog), 1.0);',
  '}'
].join('\n')
