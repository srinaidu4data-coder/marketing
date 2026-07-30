export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/chains/:path*",
    "/profile",
    "/api/chains/:path*",
    "/api/allocations",
    "/api/candidates/:path*",
    "/api/layouts/:path*",
  ],
};
