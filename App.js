import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Alert,
  StyleSheet,
  NativeModules,
} from "react-native";

const DEFAULT_BACKEND_PORT = "8000";
const LOCAL_BACKEND_HOST = "localhost";

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function getDevServerHost() {
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") return host;
  }

  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  const host = scriptURL?.match(/^https?:\/\/([^/:]+)/)?.[1];
  if (host && host !== "localhost" && host !== "127.0.0.1") return host;

  return null;
}

function buildBackendUrl() {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return trimTrailingSlash(process.env.EXPO_PUBLIC_BACKEND_URL);
  }

  const devServerHost = getDevServerHost();
  const backendHost = devServerHost || LOCAL_BACKEND_HOST;
  return `http://${backendHost}:${DEFAULT_BACKEND_PORT}`;
}

const BACKEND_URL = buildBackendUrl();

const CATEGORY_CONFIG = {
  all: { label: "全て", shortLabel: "全て", color: "#D8DEE9" },
  fire: { label: "火災", shortLabel: "火災", color: "#F25F5C" },
  flood: { label: "浸水・洪水", shortLabel: "浸水", color: "#4EA8DE" },
  traffic_accident: { label: "交通事故", shortLabel: "事故", color: "#FFB000" },
  railway: { label: "鉄道障害", shortLabel: "鉄道", color: "#B388FF" },
  unknown: { label: "不明", shortLabel: "不明", color: "#8E8E93" },
};

const RISK_LEVEL_CONFIG = {
  high: { label: "高", title: "警戒", color: "#F25F5C", bg: "#3A1F22" },
  medium: { label: "中", title: "注意", color: "#FFB000", bg: "#332817" },
  low: { label: "低", title: "観察", color: "#30D158", bg: "#173022" },
};

const FILTERS = ["all", "fire", "flood", "traffic_accident", "railway"];
const TIME_WINDOWS = [6, 24, 72];

// バックエンドのリスク内訳を、利用者が直感的に読める短い表示名へ変換する。
const FACTOR_LABELS = {
  sns: "SNS",
  weather: "気象",
  transport: "交通",
};

function getRiskLevel(score = 0) {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

function buildDashboardUrl(hours, category) {
  const params = [`hours=${encodeURIComponent(String(hours))}`];
  if (category !== "all") params.push(`category=${encodeURIComponent(category)}`);
  return `${BACKEND_URL}/dashboard?${params.join("&")}`;
}

function RiskBar({ score }) {
  const level = getRiskLevel(score);
  const config = RISK_LEVEL_CONFIG[level];
  const width = `${Math.min(Math.max(score, 0), 1) * 100}%`;
  return (
    <View style={styles.riskBarContainer}>
      <View style={[styles.riskBarFill, { width, backgroundColor: config.color }]} />
      <Text style={[styles.riskBarLabel, { color: config.color }]}>{Math.round(score * 100)}</Text>
    </View>
  );
}

function FilterChip({ label, active, color, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, active && { borderColor: color, backgroundColor: "#242426" }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.filterText, active && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SummaryMetric({ label, value, color }) {
  return (
    <View style={styles.metricItem}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function ConfidenceBadge({ score, label }) {
  if (score === undefined || score === null) return null;
  const color = score >= 0.75 ? "#30D158" : score >= 0.45 ? "#FFB000" : "#AEAEB2";
  return (
    <View style={styles.confidenceBadge}>
      <Text style={styles.confidenceLabel}>信頼度</Text>
      <Text style={[styles.confidenceValue, { color }]}>{label || Math.round(score * 100)}</Text>
    </View>
  );
}

function DataSummary({ summary }) {
  if (!summary) return null;
  return (
    <View style={styles.dataSummaryRow}>
      <Text style={styles.dataSummaryText}>対象 {summary.event_count}件</Text>
      <Text style={styles.dataSummaryText}>公式信号 {summary.official_signal_count}件</Text>
      <Text style={styles.dataSummaryText}>Live公式 {summary.live_official_count || 0}件</Text>
      {summary.latest_timestamp && <Text style={styles.dataSummaryText}>更新 {summary.latest_timestamp}</Text>}
    </View>
  );
}

function SystemStatus({ aiConfig }) {
  if (!aiConfig) return null;
  return (
    <View style={styles.systemStatusRow}>
      <Text style={styles.systemStatusText}>AI {aiConfig.provider}</Text>
      <Text style={styles.systemStatusText}>{aiConfig.model}</Text>
    </View>
  );
}

function LiveOfficialNote({ observation, summary }) {
  if (!observation && !summary) return null;
  const status = summary?.status || observation?.status || "normal";
  const severity = summary?.max_severity !== undefined ? Math.round(summary.max_severity * 100) : null;
  return (
    <View style={styles.liveOfficialNote}>
      <Text style={styles.liveOfficialTitle}>公式状態: {status}{severity !== null ? ` / ${severity}` : ""}</Text>
      {observation && (
        <Text style={styles.liveOfficialText} numberOfLines={2}>
          {observation.label} / {observation.observed_at}
        </Text>
      )}
    </View>
  );
}

function TimelinePanel({ timeline, summary }) {
  if (!timeline || timeline.length === 0) return null;
  const maxCount = Math.max(...timeline.map((item) => item.count), 1);
  return (
    <View style={styles.timelinePanel}>
      <Text style={styles.timelineTitle}>時間推移</Text>
      {summary && <Text style={styles.timelineSummary}>{summary}</Text>}
      <View style={styles.timelineBars}>
        {timeline.map((item) => {
          const height = `${Math.max((item.count / maxCount) * 100, item.count ? 18 : 6)}%`;
          const color = item.high_count > 0 ? RISK_LEVEL_CONFIG.high.color : item.max_score >= 0.4 ? RISK_LEVEL_CONFIG.medium.color : "#3A3A3C";
          return (
            <View style={styles.timelineItem} key={item.label}>
              <View style={styles.timelineTrack}>
                <View style={[styles.timelineFill, { height, backgroundColor: color }]} />
              </View>
              <Text style={styles.timelineCount}>{item.count}</Text>
              <Text style={styles.timelineLabel}>{item.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CategoryBreakdown({ counts }) {
  if (!counts) return null;
  const entries = FILTERS.filter((key) => key !== "all" && counts[key]).map((key) => ({
    key,
    count: counts[key],
    config: CATEGORY_CONFIG[key],
  }));
  if (entries.length === 0) return null;
  return (
    <View style={styles.categoryBreakdown}>
      {entries.map((item) => (
        <View style={styles.categoryBreakdownItem} key={item.key}>
          <View style={[styles.categoryDot, { backgroundColor: item.config.color }]} />
          <Text style={styles.categoryBreakdownText}>{item.config.shortLabel}</Text>
          <Text style={styles.categoryBreakdownCount}>{item.count}</Text>
        </View>
      ))}
    </View>
  );
}

function HotspotPanel({ hotspots }) {
  if (!hotspots || hotspots.length === 0) return null;
  return (
    <View style={styles.hotspotPanel}>
      <Text style={styles.hotspotTitle}>重点エリア</Text>
      {hotspots.map((item) => {
        const level = RISK_LEVEL_CONFIG[item.risk_level || getRiskLevel(item.max_score)];
        return (
          <View style={styles.hotspotItem} key={item.location}>
            <View style={[styles.hotspotMarker, { backgroundColor: level.color }]} />
            <Text style={styles.hotspotLocation} numberOfLines={1}>{item.location}</Text>
            <Text style={styles.hotspotMeta}>{item.count}件</Text>
          </View>
        );
      })}
    </View>
  );
}

function formatPercent(value = 0) {
  return Math.round((value || 0) * 100);
}

function formatSignedPercent(value = 0) {
  const percent = Math.round((value || 0) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}`;
}

// 卒研の評価軸を画面上でも確認できるよう、比較条件・失敗例・紐づけルールをまとめて表示する。
function EvaluationPanel({ summary }) {
  if (!summary?.results?.length) return null;
  const multiSource = summary.results.find((item) => item.mode === "multi_source") || summary.best_mode;
  const snsOnly = summary.results.find((item) => item.mode === "sns_only");
  const clustering = summary.clustering;
  const comparison = summary.comparison_summary;
  const failures = summary.failure_examples;
  const rule = summary.official_link_rule;
  return (
    <View style={styles.evaluationPanel}>
      <View style={styles.evaluationHeader}>
        <Text style={styles.evaluationTitle}>評価実験</Text>
        <Text style={styles.evaluationDataset}>{summary.dataset_size}件</Text>
      </View>
      <View style={styles.evaluationCompareRow}>
        {snsOnly && <EvaluationMetric result={snsOnly} compactLabel="SNSのみ" />}
        {multiSource && <EvaluationMetric result={multiSource} compactLabel="多ソース" highlight />}
      </View>
      <Text style={styles.evaluationNote}>
        SNS単独と公式情報統合ありを比較し、Precision / Recall / F1 を算出しています。
      </Text>
      {comparison && (
        <View style={styles.evaluationDeltaRow}>
          <Text style={styles.evaluationDeltaText}>F1 {formatSignedPercent(comparison.f1_delta)}</Text>
          <Text style={styles.evaluationDeltaText}>Recall {formatSignedPercent(comparison.recall_delta)}</Text>
          <Text style={styles.evaluationDeltaText}>Macro {formatSignedPercent(comparison.macro_f1_delta)}</Text>
        </View>
      )}
      <View style={styles.evaluationTable}>
        {summary.results.map((result) => (
          <EvaluationResultRow key={result.mode} result={result} highlight={result.mode === "multi_source"} />
        ))}
      </View>
      {clustering && (
        <View style={styles.clusterRow}>
          <Text style={styles.clusterText}>重複削減 {formatPercent(clustering.duplicate_reduction_rate)}%</Text>
          <Text style={styles.clusterText}>純度 {formatPercent(clustering.cluster_purity)}%</Text>
        </View>
      )}
      <FailureExamples examples={failures} />
      <RuleSummary rule={rule} officialMatchCount={summary.official_match_count} />
    </View>
  );
}

function EvaluationMetric({ result, compactLabel, highlight }) {
  return (
    <View style={[styles.evaluationMetric, highlight && styles.evaluationMetricHighlight]}>
      <Text style={styles.evaluationMetricLabel}>{compactLabel}</Text>
      <View style={styles.evaluationScoreRow}>
        <Text style={styles.evaluationScore}>P {formatPercent(result.precision)}</Text>
        <Text style={styles.evaluationScore}>R {formatPercent(result.recall)}</Text>
        <Text style={[styles.evaluationScore, highlight && styles.evaluationScoreHighlight]}>
          F1 {formatPercent(result.f1)}
        </Text>
      </View>
    </View>
  );
}

function EvaluationResultRow({ result, highlight }) {
  const f1Width = `${Math.min(Math.max(result.f1 || 0, 0), 1) * 100}%`;
  return (
    <View style={styles.evaluationResultRow}>
      <Text style={[styles.evaluationModeLabel, highlight && styles.evaluationModeLabelHighlight]} numberOfLines={1}>
        {result.label}
      </Text>
      <View style={styles.evaluationBarCell}>
        <View style={styles.evaluationF1Track}>
          <View style={[styles.evaluationF1Fill, { width: f1Width }, highlight && styles.evaluationF1FillHighlight]} />
        </View>
      </View>
      <Text style={styles.evaluationTableScore}>P{formatPercent(result.precision)}</Text>
      <Text style={styles.evaluationTableScore}>R{formatPercent(result.recall)}</Text>
      <Text style={[styles.evaluationTableScore, highlight && styles.evaluationTableScoreHighlight]}>
        F1{formatPercent(result.f1)}
      </Text>
    </View>
  );
}

function FailureExamples({ examples }) {
  if (!examples) return null;
  const falsePositives = examples.false_positives || [];
  const falseNegatives = examples.false_negatives || [];
  if (falsePositives.length === 0 && falseNegatives.length === 0) return null;
  return (
    <View style={styles.failurePanel}>
      <Text style={styles.failureTitle}>失敗例分析</Text>
      <FailureColumn title="誤検知" items={falsePositives} />
      <FailureColumn title="見逃し" items={falseNegatives} />
    </View>
  );
}

function FailureColumn({ title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.failureColumn}>
      <Text style={styles.failureColumnTitle}>{title}</Text>
      {items.slice(0, 2).map((item) => (
        <Text style={styles.failureText} numberOfLines={2} key={`${title}-${item.post_id}`}>
          {item.post_id}: {item.text}
        </Text>
      ))}
    </View>
  );
}

function RuleSummary({ rule, officialMatchCount }) {
  if (!rule) return null;
  return (
    <View style={styles.rulePanel}>
      <Text style={styles.ruleTitle}>公式信号紐づけ</Text>
      <View style={styles.ruleRow}>
        <Text style={styles.ruleText}>±{rule.time_window_hours}h</Text>
        <Text style={styles.ruleText}>{rule.distance_window_km}km</Text>
        <Text style={styles.ruleText}>対応 {officialMatchCount || 0}件</Text>
      </View>
      <Text style={styles.ruleDescription} numberOfLines={2}>{rule.type_rule}</Text>
    </View>
  );
}

function SignalChip({ signal }) {
  const score = Math.round((signal.severity || 0) * 100);
  return (
    <View style={styles.signalChip}>
      <Text style={styles.signalText}>{signal.label}</Text>
      <Text style={styles.signalScore}>{score}</Text>
    </View>
  );
}

function FactorPill({ label, value }) {
  const percent = Math.round((value || 0) * 100);
  return (
    <View style={styles.factorPill}>
      <Text style={styles.factorLabel}>{label}</Text>
      <Text style={styles.factorValue}>{percent}</Text>
    </View>
  );
}

function RiskFactors({ factors }) {
  if (!factors) return null;
  return (
    <View style={styles.factorRow}>
      {Object.entries(FACTOR_LABELS).map(([key, label]) => (
        <FactorPill key={key} label={label} value={factors[key]} />
      ))}
    </View>
  );
}

function ActionPlan({ actions }) {
  if (!actions || actions.length === 0) return null;
  return (
    <View style={styles.actionList}>
      {actions.map((item, index) => {
        const urgent = item.priority === "高";
        return (
          <View style={[styles.actionItem, urgent && styles.actionItemUrgent]} key={`${item.action}-${index}`}>
            <View style={styles.actionHeader}>
              <Text style={[styles.actionPriority, urgent && styles.actionPriorityUrgent]}>{item.priority}</Text>
              <Text style={styles.actionText}>{item.action}</Text>
            </View>
            <Text style={styles.actionReason}>{item.reason}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ConnectionErrorPanel({ message, onRetry }) {
  return (
    <View style={styles.connectionPanel}>
      <Text style={styles.connectionTitle}>バックエンドに接続できません</Text>
      <Text style={styles.connectionText}>接続先: {BACKEND_URL}</Text>
      <Text style={styles.connectionText}>{message}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryBtnText}>再試行</Text>
      </TouchableOpacity>
    </View>
  );
}

function RiskCard({ risk, onPress }) {
  const cat = CATEGORY_CONFIG[risk.category] || CATEGORY_CONFIG.unknown;
  const level = risk.risk_level || getRiskLevel(risk.risk_score);
  const levelConfig = RISK_LEVEL_CONFIG[level];
  const signals = risk.official_signals || [];

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(risk)} activeOpacity={0.86}>
      <View style={styles.cardHeader}>
        <View style={styles.titleBlock}>
          <Text style={[styles.categoryLabel, { color: cat.color }]}>{cat.label}</Text>
          <Text style={styles.locationText} numberOfLines={1}>{risk.location}</Text>
        </View>
        <View style={[styles.levelBadge, { backgroundColor: levelConfig.bg }]}>
          <Text style={[styles.levelBadgeText, { color: levelConfig.color }]}>{levelConfig.title}</Text>
        </View>
      </View>
      <ConfidenceBadge score={risk.confidence_score} label={risk.confidence_label} />

      <Text style={styles.cardText} numberOfLines={2}>{risk.text}</Text>
      {risk.risk_reason && <Text style={styles.reasonText} numberOfLines={2}>{risk.risk_reason}</Text>}
      {risk.action_plan?.[0] && (
        <View style={styles.primaryActionBox}>
          <Text style={styles.primaryActionLabel}>優先行動</Text>
          <Text style={styles.primaryActionText} numberOfLines={1}>{risk.action_plan[0].action}</Text>
        </View>
      )}

      <View style={styles.signalRow}>
        {signals.length > 0 ? (
          signals.slice(0, 2).map((signal) => <SignalChip key={`${risk.id}-${signal.label}`} signal={signal} />)
        ) : (
          <Text style={styles.noSignalText}>公式信号: 通常監視</Text>
        )}
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.cardMeta}>SNS {risk.sns_posts || risk.source_count}件</Text>
        <Text style={styles.cardMeta}>最終 {risk.latest_timestamp || risk.timestamp}</Text>
      </View>

      <View style={styles.riskRow}>
        <Text style={styles.riskLabel}>総合リスク</Text>
        <RiskBar score={risk.risk_score} />
      </View>
      <RiskFactors factors={risk.risk_factors} />
    </TouchableOpacity>
  );
}

function AnalysisModal({ event, visible, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const fetchAnalysis = useCallback(async () => {
    if (!event) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${BACKEND_URL}/analyze/${event.id}`, { method: "POST" });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      const data = await resp.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [event]);

  useEffect(() => {
    if (visible && event) {
      fetchAnalysis();
    } else {
      setResult(null);
      setError(null);
    }
  }, [visible, event, fetchAnalysis]);

  if (!event) return null;
  const cat = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.unknown;
  const level = event.risk_level || getRiskLevel(event.risk_score);
  const levelConfig = RISK_LEVEL_CONFIG[level];
  const signals = result?.official_signals || event.official_signals || [];
  const factors = result?.risk_factors || event.risk_factors;
  const reason = result?.risk_reason || event.risk_reason;
  const actionPlan = result?.action_plan || event.action_plan;
  const confidenceScore = result?.confidence_score ?? event.confidence_score;
  const confidenceLabel = result?.confidence_label || event.confidence_label;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#111111" />
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalTitle}>リスク詳細</Text>
            <Text style={styles.modalSubtitle}>AI評価と行動提案</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>×</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
          <View style={styles.eventInfo}>
            <View style={styles.cardHeader}>
              <Text style={[styles.categoryLabel, { color: cat.color }]}>{cat.label}</Text>
              <View style={[styles.levelBadge, { backgroundColor: levelConfig.bg }]}>
                <Text style={[styles.levelBadgeText, { color: levelConfig.color }]}>{levelConfig.title}</Text>
              </View>
            </View>
            <ConfidenceBadge score={confidenceScore} label={confidenceLabel} />
            <Text style={styles.eventInfoText}>{event.text}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaChip}>{event.location}</Text>
              <Text style={styles.metaChip}>{event.latest_timestamp || event.timestamp}</Text>
              <Text style={styles.metaChip}>SNS {event.sns_posts || event.source_count}件</Text>
            </View>
            <View style={styles.detailRiskRow}>
              <Text style={styles.riskLabel}>総合リスク</Text>
              <RiskBar score={result?.risk_score || event.risk_score} />
            </View>
            {reason && <Text style={styles.detailReasonText}>{reason}</Text>}
            <RiskFactors factors={factors} />
          </View>

          <View style={styles.analysisSection}>
            <Text style={styles.sectionTitle}>公式情報の信号</Text>
            <View style={styles.signalRow}>
              {signals.length > 0 ? (
                signals.map((signal) => <SignalChip key={signal.label} signal={signal} />)
              ) : (
                <Text style={styles.noSignalText}>現在の模擬データでは強い公式信号はありません。</Text>
              )}
            </View>
          </View>

          <View style={styles.analysisSection}>
            <Text style={styles.sectionTitle}>推奨行動</Text>
            <ActionPlan actions={actionPlan} />
          </View>

          <View style={styles.analysisSection}>
            <Text style={styles.sectionTitle}>{result?.model ? `${result.model} 分析` : "AI 分析"}</Text>
            {result?.cached && <Text style={styles.cacheText}>保存済み分析を表示しています</Text>}

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4EA8DE" />
                <Text style={styles.loadingText}>分析中...</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>分析に失敗しました</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={fetchAnalysis}>
                  <Text style={styles.retryBtnText}>再試行</Text>
                </TouchableOpacity>
              </View>
            )}

            {result && !loading && (
              <View style={styles.analysisResult}>
                {result.ai_error && (
                  <View style={styles.fallbackBox}>
                    <Text style={styles.fallbackTitle}>AI接続は未使用</Text>
                    <Text style={styles.fallbackText}>現在は保存済みデータとルールに基づく参考提案を表示しています。</Text>
                  </View>
                )}
                <Text style={styles.analysisText}>{result.analysis}</Text>
                <View style={styles.disclaimerBox}>
                  <Text style={styles.disclaimerText}>
                    模擬データに基づく参考情報です。実際の判断は自治体・気象庁・交通機関の公式情報を確認してください。
                  </Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function App() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [timeWindow, setTimeWindow] = useState(24);
  const [syncingOfficial, setSyncingOfficial] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const resp = await fetch(buildDashboardUrl(timeWindow, activeCategory));
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      const data = await resp.json();
      setDashboard(data);
      setConnectionError(null);
    } catch (e) {
      setConnectionError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory, timeWindow]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const syncOfficial = async () => {
    setSyncingOfficial(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/official/live/sync`, { method: "POST" });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      const result = await resp.json();
      await fetchDashboard(true);
      Alert.alert("公式情報を更新しました", `取得 ${result.fetched}件 / 保存 ${result.saved}件`);
    } catch (e) {
      Alert.alert("公式情報の更新に失敗しました", e.message);
      setRefreshing(false);
    } finally {
      setSyncingOfficial(false);
    }
  };

  const openRisk = (risk) => {
    setSelectedRisk(risk);
    setModalVisible(true);
  };

  const risks = dashboard?.risks || [];
  const levelCounts = dashboard?.level_counts || { high: 0, medium: 0, low: 0 };
  const categoryCounts = dashboard?.category_counts;
  const dataSummary = dashboard?.data_summary;
  const riskTimeline = dashboard?.risk_timeline || [];
  const timelineSummary = dashboard?.timeline_summary;
  const hotspots = dashboard?.hotspots || [];
  const aiConfig = dashboard?.ai_config;
  const evaluationSummary = dashboard?.evaluation_summary;
  const topRisk = dashboard?.top_risk;
  const topLevel = topRisk ? RISK_LEVEL_CONFIG[topRisk.risk_level || getRiskLevel(topRisk.risk_score)] : RISK_LEVEL_CONFIG.low;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111111" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Urban Safety</Text>
        <Text style={styles.headerSubtitle}>愛知県 都市安全モニター</Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4EA8DE" />
          <Text style={styles.loadingText}>データ読み込み中...</Text>
        </View>
      ) : (
        <FlatList
          data={risks}
          keyExtractor={(item) => item.event_id || item.id}
          renderItem={({ item }) => <RiskCard risk={item} onPress={openRisk} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {connectionError && (
                <ConnectionErrorPanel message={connectionError} onRetry={() => fetchDashboard(true)} />
              )}
              {dashboard && (
                <>
                  <View style={styles.summaryPanel}>
                    <View style={styles.summaryTop}>
                      <View style={styles.summaryTitleBlock}>
                        <Text style={styles.summaryLabel}>現在の重点リスク</Text>
                        <Text style={[styles.summaryTitle, { color: topLevel.color }]}>
                          {topRisk ? `${topLevel.title}・${CATEGORY_CONFIG[topRisk.category]?.shortLabel || "不明"}` : "通常監視"}
                        </Text>
                      </View>
                      <Text style={styles.summaryWindow}>過去{timeWindow}時間</Text>
                    </View>
                    <Text style={styles.summaryBasis}>{dashboard?.basis || "SNS模擬投稿と公式情報を統合した参考評価"}</Text>
                    <DataSummary summary={dataSummary} />
                    <LiveOfficialNote observation={dataSummary?.latest_live_official} summary={dataSummary?.live_official_summary} />
                    <SystemStatus aiConfig={aiConfig} />
                    <TimelinePanel timeline={riskTimeline} summary={timelineSummary} />
                    <EvaluationPanel summary={evaluationSummary} />
                    <CategoryBreakdown counts={categoryCounts} />
                    <HotspotPanel hotspots={hotspots} />
                    <View style={styles.metricRow}>
                      <SummaryMetric label="高" value={levelCounts.high} color={RISK_LEVEL_CONFIG.high.color} />
                      <SummaryMetric label="中" value={levelCounts.medium} color={RISK_LEVEL_CONFIG.medium.color} />
                      <SummaryMetric label="低" value={levelCounts.low} color={RISK_LEVEL_CONFIG.low.color} />
                      <SummaryMetric label="合計" value={dashboard?.risk_count || 0} color="#E5E5EA" />
                    </View>
                  </View>

                  <View style={styles.controlSection}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                      {FILTERS.map((key) => {
                        const config = CATEGORY_CONFIG[key];
                        return (
                          <FilterChip
                            key={key}
                            label={config.shortLabel}
                            active={activeCategory === key}
                            color={config.color}
                            onPress={() => setActiveCategory(key)}
                          />
                        );
                      })}
                    </ScrollView>
                    <View style={styles.windowRow}>
                      {TIME_WINDOWS.map((hours) => (
                        <FilterChip
                          key={hours}
                          label={`${hours}h`}
                          active={timeWindow === hours}
                          color="#4EA8DE"
                          onPress={() => setTimeWindow(hours)}
                        />
                      ))}
                      <TouchableOpacity style={styles.syncButton} onPress={syncOfficial} activeOpacity={0.8} disabled={syncingOfficial}>
                        <Text style={styles.syncButtonText}>{syncingOfficial ? "更新中" : "公式更新"}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchDashboard(true);
              }}
              tintColor="#4EA8DE"
            />
          }
          ListEmptyComponent={connectionError ? null : <Text style={styles.emptyText}>対象期間のリスク情報はありません</Text>}
        />
      )}

      <AnalysisModal
        event={selectedRisk}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111111" },
  header: {
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 20,
    backgroundColor: "#1C1C1E",
    borderBottomWidth: 1,
    borderBottomColor: "#2C2C2E",
  },
  headerTitle: { fontSize: 25, fontWeight: "800", color: "#F2F2F7", letterSpacing: 0 },
  headerSubtitle: { fontSize: 13, color: "#AEAEB2", marginTop: 3 },
  summaryPanel: {
    marginBottom: 12,
    padding: 16,
    backgroundColor: "#1C1C1E",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  summaryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  summaryTitleBlock: { flex: 1 },
  summaryLabel: { fontSize: 12, color: "#AEAEB2", marginBottom: 4 },
  summaryTitle: { fontSize: 24, fontWeight: "800", letterSpacing: 0 },
  summaryWindow: { fontSize: 12, color: "#AEAEB2", paddingTop: 3, flexShrink: 0 },
  summaryBasis: { fontSize: 12, color: "#C7C7CC", lineHeight: 17, marginTop: 10 },
  dataSummaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  dataSummaryText: {
    fontSize: 11,
    color: "#D1D1D6",
    backgroundColor: "#242426",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  systemStatusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  systemStatusText: {
    fontSize: 11,
    color: "#64D2FF",
    backgroundColor: "#1D2B36",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  liveOfficialNote: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#1D2B36",
    borderWidth: 1,
    borderColor: "#28546B",
  },
  liveOfficialTitle: { fontSize: 12, color: "#64D2FF", fontWeight: "800", marginBottom: 3 },
  liveOfficialText: { fontSize: 12, color: "#D1D1D6", lineHeight: 17 },
  timelinePanel: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#2C2C2E",
  },
  timelineTitle: { fontSize: 12, color: "#AEAEB2", fontWeight: "800", marginBottom: 8 },
  timelineSummary: { fontSize: 12, color: "#C7C7CC", lineHeight: 17, marginBottom: 8 },
  timelineBars: { height: 82, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  timelineItem: { flex: 1, alignItems: "center", gap: 3 },
  timelineTrack: {
    width: "100%",
    height: 42,
    borderRadius: 8,
    backgroundColor: "#242426",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  timelineFill: { width: "100%", borderRadius: 8 },
  timelineCount: { fontSize: 11, color: "#F2F2F7", fontWeight: "800" },
  timelineLabel: { fontSize: 10, color: "#8E8E93" },
  categoryBreakdown: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  categoryBreakdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#242426",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
  categoryBreakdownText: { fontSize: 11, color: "#D1D1D6" },
  categoryBreakdownCount: { fontSize: 11, color: "#F2F2F7", fontWeight: "800" },
  hotspotPanel: {
    marginTop: 12,
    gap: 7,
  },
  hotspotTitle: { fontSize: 12, color: "#AEAEB2", fontWeight: "800" },
  hotspotItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#242426",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  hotspotMarker: { width: 8, height: 8, borderRadius: 4 },
  hotspotLocation: { flex: 1, fontSize: 12, color: "#F2F2F7", fontWeight: "800" },
  hotspotMeta: { fontSize: 11, color: "#AEAEB2" },
  evaluationPanel: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#2C2C2E",
  },
  evaluationHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  evaluationTitle: { fontSize: 12, color: "#AEAEB2", fontWeight: "800" },
  evaluationDataset: { fontSize: 11, color: "#64D2FF", fontWeight: "800" },
  evaluationCompareRow: { flexDirection: "row", gap: 8 },
  evaluationMetric: {
    flex: 1,
    minHeight: 58,
    backgroundColor: "#242426",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2C2C2E",
    padding: 9,
    justifyContent: "center",
  },
  evaluationMetricHighlight: { backgroundColor: "#1D2B36", borderColor: "#28546B" },
  evaluationMetricLabel: { fontSize: 12, color: "#D1D1D6", fontWeight: "800", marginBottom: 6 },
  evaluationScoreRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  evaluationScore: { fontSize: 11, color: "#AEAEB2", fontWeight: "800" },
  evaluationScoreHighlight: { color: "#64D2FF" },
  evaluationNote: { fontSize: 11, color: "#C7C7CC", lineHeight: 16, marginTop: 8 },
  evaluationDeltaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  evaluationDeltaText: {
    fontSize: 11,
    color: "#64D2FF",
    backgroundColor: "#1D2B36",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontWeight: "800",
  },
  evaluationTable: { marginTop: 10, gap: 7 },
  evaluationResultRow: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 30 },
  evaluationModeLabel: { width: 84, fontSize: 11, color: "#D1D1D6", fontWeight: "800" },
  evaluationModeLabelHighlight: { color: "#64D2FF" },
  evaluationBarCell: { flex: 1 },
  evaluationF1Track: {
    height: 8,
    borderRadius: 8,
    backgroundColor: "#242426",
    overflow: "hidden",
  },
  evaluationF1Fill: { height: "100%", borderRadius: 8, backgroundColor: "#8E8E93" },
  evaluationF1FillHighlight: { backgroundColor: "#64D2FF" },
  evaluationTableScore: { width: 32, fontSize: 10, color: "#AEAEB2", fontWeight: "800", textAlign: "right" },
  evaluationTableScoreHighlight: { color: "#64D2FF" },
  clusterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  clusterText: {
    fontSize: 11,
    color: "#D1D1D6",
    backgroundColor: "#242426",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  failurePanel: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#2C2C2E",
    gap: 8,
  },
  failureTitle: { fontSize: 12, color: "#AEAEB2", fontWeight: "800" },
  failureColumn: { gap: 5 },
  failureColumnTitle: { fontSize: 11, color: "#64D2FF", fontWeight: "800" },
  failureText: { fontSize: 11, color: "#D1D1D6", lineHeight: 16 },
  rulePanel: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#2C2C2E",
  },
  ruleTitle: { fontSize: 12, color: "#AEAEB2", fontWeight: "800", marginBottom: 7 },
  ruleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ruleText: {
    fontSize: 11,
    color: "#D1D1D6",
    backgroundColor: "#242426",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontWeight: "800",
  },
  ruleDescription: { fontSize: 11, color: "#C7C7CC", lineHeight: 16, marginTop: 7 },
  metricRow: { flexDirection: "row", marginTop: 16, borderTopWidth: 1, borderTopColor: "#2C2C2E", paddingTop: 12 },
  metricItem: { flex: 1 },
  metricValue: { fontSize: 21, fontWeight: "800", textAlign: "center" },
  metricLabel: { fontSize: 12, color: "#AEAEB2", textAlign: "center", marginTop: 2 },
  controlSection: { marginBottom: 4, gap: 8 },
  filterRow: { gap: 8, paddingRight: 12 },
  windowRow: { flexDirection: "row", gap: 8 },
  syncButton: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#1D2B36",
    borderWidth: 1,
    borderColor: "#28546B",
    alignItems: "center",
    justifyContent: "center",
  },
  syncButtonText: { fontSize: 13, color: "#64D2FF", fontWeight: "800" },
  filterChip: {
    minWidth: 54,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3A3A3C",
    backgroundColor: "#1C1C1E",
    alignItems: "center",
    justifyContent: "center",
  },
  filterText: { fontSize: 13, color: "#AEAEB2", fontWeight: "700" },
  listContent: { padding: 12, paddingTop: 8, paddingBottom: 24, gap: 10 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { color: "#AEAEB2", fontSize: 14 },
  emptyText: { color: "#AEAEB2", textAlign: "center", marginTop: 40 },
  connectionPanel: {
    backgroundColor: "#3A1F22",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#703236",
    gap: 8,
    marginBottom: 12,
  },
  connectionTitle: { fontSize: 15, color: "#F25F5C", fontWeight: "800" },
  connectionText: { fontSize: 12, color: "#E5E5EA", lineHeight: 18 },

  card: {
    backgroundColor: "#1C1C1E",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  titleBlock: { flex: 1 },
  categoryLabel: { fontSize: 14, fontWeight: "800" },
  locationText: { fontSize: 12, color: "#AEAEB2", marginTop: 3 },
  levelBadge: { minWidth: 56, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, alignItems: "center" },
  levelBadgeText: { fontSize: 12, fontWeight: "800" },
  confidenceBadge: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "#242426",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  confidenceLabel: { fontSize: 11, color: "#AEAEB2" },
  confidenceValue: { fontSize: 12, fontWeight: "800" },
  cardText: { fontSize: 14, color: "#E5E5EA", lineHeight: 20, marginTop: 10, marginBottom: 10 },
  reasonText: { fontSize: 12, color: "#C7C7CC", lineHeight: 17, marginBottom: 10 },
  primaryActionBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#242426",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginBottom: 10,
  },
  primaryActionLabel: { fontSize: 11, color: "#64D2FF", fontWeight: "800" },
  primaryActionText: { flex: 1, fontSize: 12, color: "#F2F2F7", fontWeight: "800" },
  signalRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  signalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#242426",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  signalText: { fontSize: 12, color: "#D1D1D6" },
  signalScore: { fontSize: 12, color: "#4EA8DE", fontWeight: "800" },
  noSignalText: { fontSize: 12, color: "#8E8E93" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  cardMeta: { fontSize: 12, color: "#AEAEB2" },
  riskRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  detailRiskRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  riskLabel: { fontSize: 12, color: "#AEAEB2", width: 72 },
  riskBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: "#3A3A3C",
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "center",
  },
  riskBarFill: { height: "100%", borderRadius: 8 },
  riskBarLabel: { position: "absolute", right: 0, top: -15, fontSize: 11, fontWeight: "800" },
  factorRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  factorPill: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: "#242426",
    borderWidth: 1,
    borderColor: "#2C2C2E",
    alignItems: "center",
    justifyContent: "center",
  },
  factorLabel: { fontSize: 11, color: "#AEAEB2" },
  factorValue: { fontSize: 14, color: "#F2F2F7", fontWeight: "800", marginTop: 1 },
  actionList: { gap: 8 },
  actionItem: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#242426",
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  actionItemUrgent: { backgroundColor: "#3A1F22", borderColor: "#703236" },
  actionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionPriority: {
    minWidth: 34,
    textAlign: "center",
    fontSize: 11,
    color: "#D1D1D6",
    fontWeight: "800",
    backgroundColor: "#3A3A3C",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  actionPriorityUrgent: { color: "#fff", backgroundColor: "#F25F5C" },
  actionText: { flex: 1, fontSize: 13, color: "#F2F2F7", fontWeight: "800" },
  actionReason: { fontSize: 12, color: "#C7C7CC", lineHeight: 17, marginTop: 6 },

  modalContainer: { flex: 1, backgroundColor: "#111111" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: "#1C1C1E",
    borderBottomWidth: 1,
    borderBottomColor: "#2C2C2E",
  },
  modalTitle: { fontSize: 19, fontWeight: "800", color: "#F2F2F7" },
  modalSubtitle: { fontSize: 12, color: "#AEAEB2", marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2C2C2E",
  },
  closeBtnText: { fontSize: 22, color: "#D1D1D6", lineHeight: 24 },
  modalBody: { flex: 1, padding: 16 },
  eventInfo: {
    backgroundColor: "#1C1C1E",
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  eventInfoText: { fontSize: 15, color: "#E5E5EA", lineHeight: 22, marginTop: 10 },
  detailReasonText: { fontSize: 13, color: "#C7C7CC", lineHeight: 19, marginTop: 12 },
  metaChip: {
    fontSize: 12,
    color: "#D1D1D6",
    backgroundColor: "#242426",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  analysisSection: {
    backgroundColor: "#1C1C1E",
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#F2F2F7", marginBottom: 12 },
  loadingContainer: { alignItems: "center", padding: 24, gap: 12 },
  errorBox: { backgroundColor: "#3A1F22", borderRadius: 8, padding: 14, borderWidth: 1, borderColor: "#703236", gap: 8 },
  errorTitle: { fontSize: 14, fontWeight: "800", color: "#F25F5C" },
  errorText: { fontSize: 13, color: "#E5E5EA" },
  retryBtn: { backgroundColor: "#F25F5C", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, alignSelf: "flex-start" },
  retryBtnText: { color: "#fff", fontWeight: "800" },
  analysisResult: { gap: 12 },
  fallbackBox: { backgroundColor: "#1D2B36", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#28546B" },
  fallbackTitle: { fontSize: 13, color: "#64D2FF", fontWeight: "800", marginBottom: 3 },
  fallbackText: { fontSize: 12, color: "#D1D1D6", lineHeight: 17 },
  cacheText: { fontSize: 12, color: "#AEAEB2", marginBottom: 10 },
  analysisText: { fontSize: 14, color: "#E5E5EA", lineHeight: 22 },
  disclaimerBox: { backgroundColor: "#332817", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#6B531A" },
  disclaimerText: { fontSize: 11, color: "#FFD166", lineHeight: 16 },
});
