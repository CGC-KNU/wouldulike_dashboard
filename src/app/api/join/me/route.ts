import { NextResponse } from "next/server";
import { joinToken } from "@/lib/join";

/** 카카오로 들어왔는가(신청에 쓸 앱 토큰이 있는가). 토큰 자체는 돌려주지 않는다. */
export async function GET() {
  return NextResponse.json({ logged: Boolean(await joinToken()) });
}
