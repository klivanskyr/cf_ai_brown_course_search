export class SessionDO {
  state: DurableObjectState;
  constructor(state: DurableObjectState) { this.state = state; }
  async fetch(req: Request) {
    const { op, data }: { op: any; data: any } = await req.json();
    const key = "m";
    if (op === "get") return new Response(JSON.stringify(await this.state.storage.get(key) ?? {}));
    if (op === "merge") {
      const cur = (await this.state.storage.get(key)) ?? {};
      const next = { ...cur, ...data };
      await this.state.storage.put(key, next);
      return new Response(JSON.stringify(next));
    }
    return new Response("ok");
  }
}
