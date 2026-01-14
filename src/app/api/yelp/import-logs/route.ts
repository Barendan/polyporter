import { NextRequest, NextResponse } from 'next/server';
import { getImportLogsByCity } from '@/lib/database/importLogs';

export async function GET(request: NextRequest) {
  const cityId = request.nextUrl.searchParams.get('cityId');
  if (!cityId) {
    return NextResponse.json({ logs: [] });
  }
  const logs = await getImportLogsByCity(cityId);
  return NextResponse.json({ logs });
}
