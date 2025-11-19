// API endpoint to check which restaurants already exist in the database
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/config/supabaseServer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { yelpIds } = body;

    // Input validation
    if (!yelpIds || !Array.isArray(yelpIds) || yelpIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid yelpIds: must be a non-empty array',
          existingIds: []
        },
        { status: 400 }
      );
    }

    // Validate all IDs are strings
    const validIds = yelpIds.filter(id => typeof id === 'string' && id.trim().length > 0);
    
    if (validIds.length === 0) {
      return NextResponse.json({
        success: true,
        existingIds: [],
        message: 'No valid IDs to check'
      });
    }

    // Query database for existing restaurants
    // Split into batches to avoid URL length limits
    const batchSize = 100;
    const existingIds: string[] = [];

    for (let i = 0; i < validIds.length; i += batchSize) {
      const batch = validIds.slice(i, i + batchSize);
      
      const { data, error } = await supabaseServer
        .from('yelp_staging')
        .select('id')
        .in('id', batch);

      if (error) {
        console.error('Error checking existing restaurants:', error);
        // Continue with other batches even if one fails
        continue;
      }

      if (data && data.length > 0) {
        existingIds.push(...data.map(row => row.id));
      }
    }

    return NextResponse.json({
      success: true,
      existingIds,
      total: validIds.length,
      existingCount: existingIds.length
    });

  } catch (error) {
    console.error('❌ Exception in POST /api/yelp/staging/check-existing:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error while checking existing restaurants',
        existingIds: []
      },
      { status: 500 }
    );
  }
}

