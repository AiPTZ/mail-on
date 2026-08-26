import { NextResponse } from "next/server";
import { tickWorker } from "@/lib/worker";

export async function POST() {
  const result = await tickWorker();
  return NextResponse.json(result);
}

export async function GET() {
  const result = await tickWorker();
  return NextResponse.json(result);
}
