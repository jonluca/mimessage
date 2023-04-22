export function euclideanSimilarity(vectorA: Float32Array, vectorB: Float32Array) {
  let sum = 0;
  const length = vectorA.length;
  for (let i = 0; i < length; i++) {
    const diff = vectorA[i] - vectorB[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}
export function dotSimilarity(vectorA: Float32Array, vectorB: Float32Array) {
  return 0;
}
export function cosineSimilarity(vectorA: Float32Array, vectorB: Float32Array) {
  const dimensionality = Math.min(vectorA.length, vectorB.length);
  let dotAB = 0;
  let dotA = 0;
  let dotB = 0;
  let dimension = 0;
  while (dimension < dimensionality) {
    const componentA = vectorA[dimension];
    const componentB = vectorB[dimension];
    dotAB += componentA * componentB;
    dotA += componentA * componentA;
    dotB += componentB * componentB;
    dimension += 1;
  }

  const magnitude = Math.sqrt(dotA * dotB);
  return magnitude === 0 ? 0 : dotAB / magnitude;
}
