// Minimal PostgREST test adapter. Never connects to a real database.
export type Row = Record<string, unknown>;
export class MemoryDb {
  tables: Record<string, Row[]> = {};
  from(table: string) { return new Query(this.tables[table] ??= []); }
}
class Query {
  private filters: ((row: Row) => boolean)[] = [];
  private mutation?: () => Row[];
  private selected = false;
  private count = Infinity;
  private sort?: { field: string; ascending: boolean };
  constructor(private rows: Row[]) {}
  select() { this.selected = true; return this; }
  eq(key: string, value: unknown) { this.filters.push((r) => r[key] === value); return this; }
  neq(key: string, value: unknown) { this.filters.push((r) => r[key] !== value); return this; }
  in(key: string, values: unknown[]) { this.filters.push((r) => values.includes(r[key])); return this; }
  contains(key: string, value: Row) {
    this.filters.push((r) => Object.entries(value).every(([k, v]) => (r[key] as Row)?.[k] === v)); return this;
  }
  order(field: string, opts: { ascending?: boolean } = {}) { this.sort = { field, ascending: opts.ascending ?? true }; return this; }
  limit(count: number) { this.count = count; return this; }
  update(value: Row) {
    this.mutation = () => this.matching().map((r) => Object.assign(r, structuredClone(value))); return this;
  }
  insert(value: Row) { return this.add(value, false); }
  upsert(value: Row, opts: { ignoreDuplicates?: boolean } = {}) { return this.add(value, Boolean(opts.ignoreDuplicates)); }
  private add(value: Row, ignoreDuplicate: boolean) {
    this.mutation = () => {
      const existing = value.id && this.rows.find((r) => r.id === value.id);
      if (existing) {
        if (ignoreDuplicate) return [];
        throw new Error("duplicate primary key");
      }
      const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), is_seed: false, ...structuredClone(value) };
      this.rows.push(row);
      return [row];
    };
    return this;
  }
  private matching() { return this.rows.filter((r) => this.filters.every((f) => f(r))); }
  private execute(single = false) {
    let rows = this.mutation ? this.mutation() : this.matching();
    if (this.sort) {
      const { field, ascending } = this.sort;
      rows = [...rows].sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (ascending ? 1 : -1));
    }
    rows = rows.slice(0, this.count);
    const data = this.mutation && !this.selected ? null : single ? rows[0] ?? null : rows;
    return { data: structuredClone(data), error: null };
  }
  single() { return Promise.resolve(this.execute(true)); }
  maybeSingle() { return Promise.resolve(this.execute(true)); }
  then<TResult1 = ReturnType<Query["execute"]>, TResult2 = never>(
    onfulfilled?: ((value: ReturnType<Query["execute"]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> { return Promise.resolve().then(() => this.execute()).then(onfulfilled, onrejected); }
}
