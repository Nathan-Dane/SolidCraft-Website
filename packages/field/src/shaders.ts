/*
 * The shaders. A stroke is one instanced quad; the fragment shader evaluates the exact distance to a line or a circular arc, so
 * lines are crisp at any zoom and dashes (round caps included) are analytic. `lim` cuts a stroke at a length, with a bright tip:
 * the pen of the entrance. Glyph labels and arrow heads go through the second, textured program.
 */

/** Stroke program: vertex stage. */
export const STROKE_VERTEX = `attribute vec2 a_corner;
attribute vec4 a_geo; attribute vec4 a_bbox; attribute vec4 a_p; attribute vec4 a_col; attribute vec4 a_dash; attribute vec4 a_d2;
uniform vec4 u_view; uniform vec2 u_size;
varying vec2 v_w; varying vec4 v_geo; varying vec4 v_p; varying vec4 v_col; varying vec4 v_dash; varying vec4 v_d2;
void main(){
  vec2 w = mix(a_bbox.xy, a_bbox.zw, a_corner);
  v_w = w; v_geo = a_geo; v_p = a_p; v_col = a_col; v_dash = a_dash; v_d2 = a_d2;
  vec2 px = (w - u_view.xy) * u_view.z;
  gl_Position = vec4(px.x / u_size.x * 2.0 - 1.0, 1.0 - px.y / u_size.y * 2.0, 0.0, 1.0);
}`;

/** Stroke program: fragment stage. */
export const STROKE_FRAGMENT = `precision highp float;
uniform vec4 u_view;
varying vec2 v_w; varying vec4 v_geo; varying vec4 v_p; varying vec4 v_col; varying vec4 v_dash; varying vec4 v_d2;
const float TAU = 6.28318530718;
float dashDist(float sl, float a, float b, float dperp, bool rnd){
  if (rnd) return length(vec2(max(max(a - sl, 0.0), sl - b), dperp));
  return (sl >= a && sl <= b) ? dperp : 1.0e5;
}
void main(){
  float len = v_d2.y;
  if (len <= 0.0) discard;
  float hw = v_p.z * 0.5;
  float s; float dperp;
  if (v_p.x < 0.5) {
    vec2 e = v_geo.zw - v_geo.xy;
    vec2 u = e / len;
    vec2 q = v_w - v_geo.xy;
    s = dot(q, u);
    dperp = abs(dot(q, vec2(-u.y, u.x)));
  } else {
    vec2 q = v_w - v_geo.xy;
    float r = v_geo.z;
    float sw = v_p.y;
    float dirS = sw >= 0.0 ? 1.0 : -1.0;
    float da = atan(q.y, q.x) - v_geo.w;
    float t = mod(da * dirS, TAU);
    float absSw = abs(sw);
    dperp = abs(length(q) - r);
    s = t * r;
    if (t > absSw) { float over = t - absSw; float under = TAU - t; s = (over < under) ? (len + over * r) : (-under * r); }
  }
  float lim = v_d2.z; float head = 0.0;
  if (lim > 0.0) { float pp = s + v_d2.x; if (pp > lim) discard; head = clamp(1.0 - (lim - pp) * u_view.z / 26.0, 0.0, 1.0); }
  float f = floor(v_col.w + 0.5);
  bool capS = mod(f, 2.0) >= 0.5;
  bool capE = mod(floor(f / 2.0), 2.0) >= 0.5;
  bool dRound = mod(floor(f / 4.0), 2.0) >= 0.5;
  float period = v_dash.x + v_dash.y + v_dash.z + v_dash.w;
  float dist;
  if (period > 1.0e-4) {
    if (s < 0.0 || s > len) discard;
    float ps = s + v_d2.x;
    float k0 = floor(ps / period);
    dist = 1.0e5;
    for (int k = -1; k <= 1; k++) {
      float sl = ps - (k0 + float(k)) * period;
      dist = min(dist, dashDist(sl, 0.0, v_dash.x, dperp, dRound));
      if (v_dash.z > 1.0e-4) dist = min(dist, dashDist(sl, v_dash.x + v_dash.y, v_dash.x + v_dash.y + v_dash.z, dperp, dRound));
    }
  } else {
    if (s < 0.0) { if (!capS) discard; dist = length(vec2(s, dperp)); }
    else if (s > len) { if (!capE) discard; dist = length(vec2(s - len, dperp)); }
    else dist = dperp;
  }
  float cov = clamp((hw - dist) * u_view.z + 0.5, 0.0, 1.0);
  float a = cov * v_p.w;
  if (a <= 0.003) discard;
  vec3 rgb = mix(v_col.rgb, vec3(0.80, 0.94, 1.0), head * 0.9);
  a = min(1.0, a * (1.0 + head * 0.9));
  gl_FragColor = vec4(rgb * a, a);
}`;

/** Fill and glyph program: vertex stage. */
export const FILL_VERTEX = `attribute vec2 a_pos; attribute vec2 a_uv; attribute vec4 a_col;
uniform vec4 u_view; uniform vec2 u_size;
varying vec2 v_uv; varying vec4 v_col;
void main(){
  vec2 px = (a_pos - u_view.xy) * u_view.z;
  gl_Position = vec4(px.x / u_size.x * 2.0 - 1.0, 1.0 - px.y / u_size.y * 2.0, 0.0, 1.0);
  v_uv = a_uv; v_col = a_col;
}`;

/** Fill and glyph program: fragment stage. */
export const FILL_FRAGMENT = `precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv; varying vec4 v_col;
void main(){ float a = texture2D(u_tex, v_uv).a; gl_FragColor = v_col * a; }`;
