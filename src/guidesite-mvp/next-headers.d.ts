declare module "next/headers" {
  export interface ReadonlyRequestCookie {
    value: string;
  }

  export interface ReadonlyRequestCookies {
    get(name: string): ReadonlyRequestCookie | undefined;
  }

  export function cookies(): Promise<ReadonlyRequestCookies>;
}
