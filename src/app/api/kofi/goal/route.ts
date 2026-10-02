import { NextResponse } from "next/server"
import { getKofiGoal } from "@/lib/kofi-goal"

export async function GET(): Promise<Response> {
  const goal = await getKofiGoal()
  return NextResponse.json(goal, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  })
}
