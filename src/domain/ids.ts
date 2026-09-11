export type Brand<K extends string> = string & { readonly __brand: K };

export type ParentId = Brand<"ParentId">;
export type StudentId = Brand<"StudentId">;
export type TrialClassId = Brand<"TrialClassId">;
export type BookingId = Brand<"BookingId">;

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
