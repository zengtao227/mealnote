export interface RequestRevisionToken {
  revision: number;
  signal: AbortSignal;
}

export class RequestRevisionGuard {
  private revision: number = 0;
  private activeController: AbortController | undefined;

  begin(): RequestRevisionToken {
    this.activeController?.abort();
    const controller: AbortController = new AbortController();
    this.activeController = controller;
    this.revision += 1;
    return { revision: this.revision, signal: controller.signal };
  }

  invalidate(): void {
    this.revision += 1;
    this.activeController?.abort();
    this.activeController = undefined;
  }

  isCurrent(token: RequestRevisionToken): boolean {
    return token.revision === this.revision && !token.signal.aborted;
  }

  finish(token: RequestRevisionToken): boolean {
    if (!this.isCurrent(token)) {
      return false;
    }
    this.activeController = undefined;
    return true;
  }
}
