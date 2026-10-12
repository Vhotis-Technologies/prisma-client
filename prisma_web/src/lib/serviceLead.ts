/** Valet type applied on every web booking so the customer does not pick one. */
export function handWashValet<T extends { name: string }>(valets: T[]): T | null {
  return valets.find((item) => item.name.trim().toLowerCase() === "hand wash") ?? null;
}
