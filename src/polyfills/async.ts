export class AsyncLocalStorage {
  private store: any = undefined
  
  run(store: any, callback: () => any) {
    this.store = store
    const result = callback()
    return result
  }
  
  getStore() {
    return this.store
  }

  enterWith(store: any) {
    this.store = store
  }
}

export class AsyncResource {
  constructor(_type: string) {}
  runInAsyncScope(fn: () => any) { return fn() }
  static bind(fn: () => any) { return fn }
  bind(fn: () => any) { return fn }
}

export default { AsyncLocalStorage, AsyncResource }