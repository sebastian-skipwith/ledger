// LedgerWidget.kt — Android Jetpack Glance Widget
// Place in: app/src/main/java/app/ledger/widget/

package app.ledger.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.*
import androidx.glance.action.clickable
import androidx.glance.appwidget.*
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.layout.*
import androidx.glance.text.*
import androidx.glance.unit.ColorProvider
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

// ─────────────────────────────────────────────
// DATA MODEL
// ─────────────────────────────────────────────

data class FinancialSnapshot(
    val netWorth: Double = 0.0,
    val cash: Double = 0.0,
    val investments: Double = 0.0,
    val totalDebt: Double = 0.0,
    val monthlyBills: Double = 0.0,
)

fun Double.toCompact(): String = when {
    this >= 1_000_000 -> "$%.1fM".format(this / 1_000_000)
    this >= 1_000     -> "$%.0fk".format(this / 1_000)
    else              -> "$%.0f".format(this)
}

// ─────────────────────────────────────────────
// GLANCE STATE
// ─────────────────────────────────────────────

class LedgerWidgetStateDefinition : GlanceStateDefinition<FinancialSnapshot> {
    override suspend fun getDataStore(context: Context, fileKey: String) =
        throw NotImplementedError("Use DataStore directly")

    override fun getLocation(context: Context, fileKey: String) =
        throw NotImplementedError("Use DataStore directly")
}

// ─────────────────────────────────────────────
// WIDGET
// ─────────────────────────────────────────────

class LedgerGlanceWidget : GlanceAppWidget() {

    @Composable
    override fun Content() {
        val context = LocalContext.current
        val snap = currentState<FinancialSnapshot>() ?: FinancialSnapshot()

        GlanceTheme {
            Box(
                modifier = GlanceModifier
                    .fillMaxSize()
                    .background(Color(0xFF0A0A0F))
                    .cornerRadius(16.dp)
                    .padding(12.dp)
            ) {
                Column(
                    modifier = GlanceModifier.fillMaxSize(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Header
                    Row(
                        modifier = GlanceModifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "ledger",
                            style = TextStyle(
                                color = ColorProvider(Color(0xFFD4AF37)),
                                fontSize = 13.sp,
                                fontStyle = FontStyle.Italic,
                            )
                        )
                    }

                    Spacer(GlanceModifier.height(8.dp))

                    // Net Worth
                    Text(
                        "NET WORTH",
                        style = TextStyle(
                            color = ColorProvider(Color(0xFF666680)),
                            fontSize = 8.sp,
                        )
                    )
                    Text(
                        snap.netWorth.toCompact(),
                        style = TextStyle(
                            color = ColorProvider(Color(0xFF16C784)),
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    )

                    Spacer(GlanceModifier.height(8.dp))

                    // Metrics row
                    Row(modifier = GlanceModifier.fillMaxWidth()) {
                        MetricCell("CASH", snap.cash, Color.White, GlanceModifier.defaultWeight())
                        MetricCell("INVEST", snap.investments, Color(0xFFA78BFA), GlanceModifier.defaultWeight())
                        MetricCell("DEBT", snap.totalDebt,
                            if (snap.totalDebt > 0) Color(0xFFF04F54) else Color(0xFF16C784),
                            GlanceModifier.defaultWeight()
                        )
                    }
                }
            }
        }
    }

    @Composable
    fun MetricCell(label: String, value: Double, color: Color, modifier: GlanceModifier) {
        Column(modifier = modifier) {
            Text(label, style = TextStyle(color = ColorProvider(Color(0xFF666680)), fontSize = 7.sp))
            Text(
                value.toCompact(),
                style = TextStyle(color = ColorProvider(color), fontSize = 12.sp, fontWeight = FontWeight.Bold)
            )
        }
    }
}

// ─────────────────────────────────────────────
// RECEIVER
// ─────────────────────────────────────────────

class LedgerWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget = LedgerGlanceWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        scheduleUpdates(context)
    }

    private fun scheduleUpdates(context: Context) {
        val workRequest = PeriodicWorkRequestBuilder<LedgerDataWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "ledger_widget_sync",
            ExistingPeriodicWorkPolicy.KEEP,
            workRequest
        )
    }
}

// ─────────────────────────────────────────────
// WORKER — fetches data and updates widget
// ─────────────────────────────────────────────

class LedgerDataWorker(
    private val context: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val snap = fetchSnapshot()
            if (snap != null) {
                // Update all widget instances
                LedgerGlanceWidget().apply {
                    updateAll(context)
                }
            }
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    private suspend fun fetchSnapshot(): FinancialSnapshot? = withContext(Dispatchers.IO) {
        val prefs = context.getSharedPreferences("ledger", Context.MODE_PRIVATE)
        val token = prefs.getString("auth_token", null) ?: return@withContext null
        val apiUrl = prefs.getString("api_url", "https://api.yourledger.app") ?: return@withContext null

        try {
            val url = URL("$apiUrl/api/ai/insights")
            val conn = url.openConnection() as HttpURLConnection
            conn.apply {
                setRequestProperty("Authorization", "Bearer $token")
                connectTimeout = 10_000
                readTimeout = 10_000
            }
            val json = JSONObject(conn.inputStream.bufferedReader().readText())
            val ctx = json.optJSONObject("context") ?: return@withContext null
            FinancialSnapshot(
                netWorth     = ctx.optDouble("net_worth", 0.0),
                cash         = ctx.optDouble("cash", 0.0),
                investments  = ctx.optDouble("investments", 0.0),
                totalDebt    = ctx.optDouble("total_debt", 0.0),
                monthlyBills = ctx.optDouble("monthly_bills", 0.0),
            )
        } catch (e: Exception) { null }
    }
}
