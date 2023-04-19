type ArrayLike = Float32Array;

function l2norm(arr: ArrayLike) {
  const len = arr.length;
  let t = 0;
  let s = 1;
  let r;
  let val;
  let abs;
  let i;

  for (i = 0; i < len; i++) {
    val = arr[i];
    abs = val < 0 ? -val : val;
    if (abs > 0) {
      if (abs > t) {
        r = t / val;
        s = 1 + s * r * r;
        t = abs;
      } else {
        r = val / t;
        s = s + r * r;
      }
    }
  }
  return t * Math.sqrt(s);
}
function dot(x: ArrayLike, y: ArrayLike) {
  const len = x.length;
  let sum = 0;
  let i;

  for (i = 0; i < len; i++) {
    sum += x[i] * y[i];
  }
  return sum;
}
function cosineSimilarity(x: ArrayLike, y: ArrayLike): number {
  const a = dot(x, y);
  const b = l2norm(x);
  const c = l2norm(y);
  return a / (b * c);
}

export default cosineSimilarity;
