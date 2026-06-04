export function getIndefiniteArticleForAge(age: number): "a" | "an" {
  const ageText = String(Math.trunc(Math.abs(age)));
  if (ageText.startsWith("8") || ageText.startsWith("11") || ageText.startsWith("18")) {
    return "an";
  }

  return "a";
}
