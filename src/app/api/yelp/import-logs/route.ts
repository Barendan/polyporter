import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/shared/config/supabaseServer';
import { getImportLogsByCity, getAllImportLogs } from '@/features/yelp/data/importLogs';

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

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const logId = searchParams.get('id');

    if (!logId || logId.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: 'Missing required id parameter' },
        { status: 400 }
      );
    }

    const normalizedLogId = logId.trim();

    const { data: existingLog, error: existingError } = await supabaseServer
      .from('yelp_import_logs')
      .select('id')
      .eq('id', normalizedLogId)
      .maybeSingle();

    if (existingError) {
      console.error('❌ Error checking import log existence:', {
        logId: normalizedLogId,
        message: existingError.message,
        code: existingError.code,
        details: existingError.details,
        hint: existingError.hint
      });
      return NextResponse.json(
        { success: false, message: 'Failed to check import log' },
        { status: 500 }
      );
    }

    if (!existingLog) {
      return NextResponse.json(
        { success: false, message: 'Import log not found' },
        { status: 404 }
      );
    }

    const { data: stagingRows, error: stagingFetchError } = await supabaseServer
      .from('yelp_staging')
      .select('h3_id')
      .eq('yelp_import_log', normalizedLogId);

    if (stagingFetchError) {
      console.error('❌ Error fetching staging rows for import log:', {
        logId: normalizedLogId,
        message: stagingFetchError.message,
        code: stagingFetchError.code,
        details: stagingFetchError.details,
        hint: stagingFetchError.hint
      });
      return NextResponse.json(
        { success: false, message: 'Failed to fetch staging rows for import log' },
        { status: 500 }
      );
    }

    const affectedH3Ids = Array.from(
      new Set(
        (stagingRows || [])
          .map(row => row.h3_id)
          .filter((h3Id): h3Id is string => typeof h3Id === 'string' && h3Id.trim().length > 0)
      )
    );

    const { error: deleteStagingError } = await supabaseServer
      .from('yelp_staging')
      .delete()
      .eq('yelp_import_log', normalizedLogId);

    if (deleteStagingError) {
      console.error('❌ Error deleting staging rows for import log:', {
        logId: normalizedLogId,
        message: deleteStagingError.message,
        code: deleteStagingError.code,
        details: deleteStagingError.details,
        hint: deleteStagingError.hint
      });
      return NextResponse.json(
        { success: false, message: 'Failed to delete staging rows for import log' },
        { status: 500 }
      );
    }

    for (const h3Id of affectedH3Ids) {
      const { count, error: countError } = await supabaseServer
        .from('yelp_staging')
        .select('*', { count: 'exact', head: true })
        .eq('h3_id', h3Id);

      if (countError) {
        console.warn('⚠️ Failed to count staged restaurants after delete:', {
          h3Id,
          message: countError.message,
          code: countError.code,
          details: countError.details,
          hint: countError.hint
        });
        continue;
      }

      const remainingCount = count || 0;

      if (remainingCount === 0) {
        const { error: deleteHexError } = await supabaseServer
          .from('yelp_hextiles')
          .delete()
          .eq('h3_id', h3Id);

        if (deleteHexError) {
          console.warn('⚠️ Failed to delete hex tile after staging delete:', {
            h3Id,
            message: deleteHexError.message,
            code: deleteHexError.code,
            details: deleteHexError.details,
            hint: deleteHexError.hint
          });
        }
      } else {
        const { error: updateHexError } = await supabaseServer
          .from('yelp_hextiles')
          .update({ staged: remainingCount })
          .eq('h3_id', h3Id);

        if (updateHexError) {
          console.warn('⚠️ Failed to update hex tile staged count after delete:', {
            h3Id,
            message: updateHexError.message,
            code: updateHexError.code,
            details: updateHexError.details,
            hint: updateHexError.hint
          });
        }
      }
    }

    const { error: deleteRestaurantsError, count: deletedRestaurantsCount } = await supabaseServer
      .from('restaurants')
      .delete({ count: 'exact' })
      .eq('import_log_id', normalizedLogId);

    if (deleteRestaurantsError) {
      console.error('❌ Error deleting restaurants for import log:', {
        logId: normalizedLogId,
        message: deleteRestaurantsError.message,
        code: deleteRestaurantsError.code,
        details: deleteRestaurantsError.details,
        hint: deleteRestaurantsError.hint
      });
      return NextResponse.json(
        { success: false, message: 'Failed to delete restaurants for import log' },
        { status: 500 }
      );
    }

    const { error: deleteLogError } = await supabaseServer
      .from('yelp_import_logs')
      .delete()
      .eq('id', normalizedLogId);

    if (deleteLogError) {
      console.error('❌ Error deleting import log:', {
        logId: normalizedLogId,
        message: deleteLogError.message,
        code: deleteLogError.code,
        details: deleteLogError.details,
        hint: deleteLogError.hint
      });
      return NextResponse.json(
        { success: false, message: 'Failed to delete import log' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedLogId: normalizedLogId,
      deletedStagingCount: stagingRows?.length || 0,
      affectedHextiles: affectedH3Ids.length,
      deletedRestaurantsCount: deletedRestaurantsCount || 0
    });
  } catch (error) {
    console.error('❌ Exception deleting import log:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { success: false, message: 'Internal server error while deleting import log' },
      { status: 500 }
    );
  }
}
