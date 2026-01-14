import { NextRequest, NextResponse } from 'next/server';
import { getImportLogsByCity, getAllImportLogs } from '@/lib/database/importLogs';

export async function GET(request: NextRequest) {
  const cityId = request.nextUrl.searchParams.get('cityId');
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  
  // If cityId is provided, get logs for that city
  // Otherwise, get all recent logs
  if (cityId) {
    const logs = await getImportLogsByCity(cityId);
    return NextResponse.json({ logs });
  } else {
    const logs = await getAllImportLogs(limit);
    return NextResponse.json({ logs });
  }
}
