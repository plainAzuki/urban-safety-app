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
} from "react-native";

// ★★★ 自分のPCのローカルIPアドレスに変更してください ★★★
const BACKEND_URL = "http://192.0.0.2:8000";

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

function SignalChip({ signal }) {
  const score = Math.round((signal.severity || 0) * 100);
  return (
    <View style={styles.signalChip}>
      <Text style={styles.signalText}>{signal.label}</Text>
      <Text style={styles.signalScore}>{score}</Text>
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

      <Text style={styles.cardText} numberOfLines={2}>{risk.text}</Text>

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
            <Text style={styles.sectionTitle}>{result?.model ? `${result.model} 分析` : "AI 分析"}</Text>

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

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const resp = await fetch(buildDashboardUrl(timeWindow, activeCategory));
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      const data = await resp.json();
      setDashboard(data);
    } catch (e) {
      Alert.alert(
        "接続エラー",
        `バックエンドに接続できません。\n\nBACKEND_URL を確認してください:\n${BACKEND_URL}\n\n詳細: ${e.message}`
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory, timeWindow]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const openRisk = (risk) => {
    setSelectedRisk(risk);
    setModalVisible(true);
  };

  const risks = dashboard?.risks || [];
  const levelCounts = dashboard?.level_counts || { high: 0, medium: 0, low: 0 };
  const topRisk = dashboard?.top_risk;
  const topLevel = topRisk ? RISK_LEVEL_CONFIG[topRisk.risk_level || getRiskLevel(topRisk.risk_score)] : RISK_LEVEL_CONFIG.low;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111111" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Urban Safety</Text>
        <Text style={styles.headerSubtitle}>愛知県 都市安全モニター</Text>
      </View>

      <View style={styles.summaryPanel}>
        <View style={styles.summaryTop}>
          <View>
            <Text style={styles.summaryLabel}>現在の重点リスク</Text>
            <Text style={[styles.summaryTitle, { color: topLevel.color }]}>
              {topRisk ? `${topLevel.title}・${CATEGORY_CONFIG[topRisk.category]?.shortLabel || "不明"}` : "通常監視"}
            </Text>
          </View>
          <Text style={styles.summaryWindow}>過去{timeWindow}時間</Text>
        </View>
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
        </View>
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
          ListEmptyComponent={<Text style={styles.emptyText}>対象期間のリスク情報はありません</Text>}
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
    margin: 12,
    padding: 16,
    backgroundColor: "#1C1C1E",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  summaryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  summaryLabel: { fontSize: 12, color: "#AEAEB2", marginBottom: 4 },
  summaryTitle: { fontSize: 24, fontWeight: "800", letterSpacing: 0 },
  summaryWindow: { fontSize: 12, color: "#AEAEB2", paddingTop: 3 },
  metricRow: { flexDirection: "row", marginTop: 16, borderTopWidth: 1, borderTopColor: "#2C2C2E", paddingTop: 12 },
  metricItem: { flex: 1 },
  metricValue: { fontSize: 21, fontWeight: "800", textAlign: "center" },
  metricLabel: { fontSize: 12, color: "#AEAEB2", textAlign: "center", marginTop: 2 },
  controlSection: { paddingHorizontal: 12, marginBottom: 4, gap: 8 },
  filterRow: { gap: 8, paddingRight: 12 },
  windowRow: { flexDirection: "row", gap: 8 },
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
  listContent: { padding: 12, paddingTop: 8, gap: 10 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { color: "#AEAEB2", fontSize: 14 },
  emptyText: { color: "#AEAEB2", textAlign: "center", marginTop: 40 },

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
  cardText: { fontSize: 14, color: "#E5E5EA", lineHeight: 20, marginTop: 10, marginBottom: 10 },
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
  analysisText: { fontSize: 14, color: "#E5E5EA", lineHeight: 22 },
  disclaimerBox: { backgroundColor: "#332817", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#6B531A" },
  disclaimerText: { fontSize: 11, color: "#FFD166", lineHeight: 16 },
});
