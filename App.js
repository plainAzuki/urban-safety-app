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

// ★★★ あなたのPCのローカルIPアドレスに変更してください ★★★
// Mac/Linux: ifconfig | grep "inet "
// Windows:   ipconfig | findstr IPv4
const BACKEND_URL = "http://10.14.4.218:8000";　//ここを変更！！

// ─── カテゴリ設定 ──────────────────────────────────────────────
const CATEGORY_CONFIG = {
  fire:             { label: "🔥 火災",     color: "#FF4444" },
  flood:            { label: "🌊 浸水",     color: "#4488FF" },
  traffic_accident: { label: "🚗 交通事故", color: "#FF8800" },
  railway:          { label: "🚃 鉄道障害", color: "#AA44FF" },
  unknown:          { label: "❓ 不明",     color: "#888888" },
};

const SEVERITY_CONFIG = {
  high:   { label: "高", color: "#FF4444", bg: "#FF444420" },
  medium: { label: "中", color: "#FF8800", bg: "#FF880020" },
  low:    { label: "低", color: "#44AA44", bg: "#44AA4420" },
};

// ─── リスクバー コンポーネント ────────────────────────────────
function RiskBar({ score }) {
  const color = score >= 0.7 ? "#FF4444" : score >= 0.4 ? "#FF8800" : "#44AA44";
  return (
    <View style={styles.riskBarContainer}>
      <View style={[styles.riskBarFill, { width: `${score * 100}%`, backgroundColor: color }]} />
      <Text style={[styles.riskBarLabel, { color }]}>{(score * 100).toFixed(0)}</Text>
    </View>
  );
}

// ─── イベントカード コンポーネント ───────────────────────────
function EventCard({ event, onPress }) {
  const cat = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.unknown;
  const sev = SEVERITY_CONFIG[event.severity] || SEVERITY_CONFIG.low;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(event)} activeOpacity={0.85}>
      {/* ヘッダー行 */}
      <View style={styles.cardHeader}>
        <Text style={[styles.categoryLabel, { color: cat.color }]}>{cat.label}</Text>
        <View style={[styles.severityBadge, { backgroundColor: sev.bg }]}>
          <Text style={[styles.severityText, { color: sev.color }]}>深刻度: {sev.label}</Text>
        </View>
      </View>

      {/* 投稿テキスト */}
      <Text style={styles.cardText} numberOfLines={2}>{event.text}</Text>

      {/* フッター行 */}
      <View style={styles.cardFooter}>
        <Text style={styles.cardMeta}>📍 {event.location}</Text>
        <Text style={styles.cardMeta}>🕐 {event.timestamp}</Text>
        <Text style={styles.cardMeta}>💬 {event.source_count}件</Text>
      </View>

      {/* リスクスコアバー */}
      <View style={styles.riskRow}>
        <Text style={styles.riskLabel}>リスクスコア</Text>
        <RiskBar score={event.risk_score} />
      </View>
    </TouchableOpacity>
  );
}

// ─── 分析モーダル コンポーネント ────────────────────────────
function AnalysisModal({ event, visible, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible && event) {
      fetchAnalysis();
    } else {
      setResult(null);
      setError(null);
    }
  }, [visible, event]);

  const fetchAnalysis = async () => {
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
  };

  if (!event) return null;
  const cat = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.unknown;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <View style={styles.modalContainer}>
        {/* モーダルヘッダー */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>AI 分析レポート</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
          {/* イベント情報 */}
          <View style={styles.eventInfo}>
            <Text style={[styles.categoryLabel, { color: cat.color, fontSize: 16 }]}>{cat.label}</Text>
            <Text style={styles.eventInfoText}>{event.text}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaChip}>📍 {event.location}</Text>
              <Text style={styles.metaChip}>🕐 {event.timestamp}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaChip}>💬 投稿数: {event.source_count}件</Text>
              {result && <Text style={styles.metaChip}>📊 スコア: {(result.risk_score * 100).toFixed(0)}/100</Text>}
            </View>
          </View>

          {/* AI分析結果 */}
          <View style={styles.analysisSection}>
            <Text style={styles.sectionTitle}>🤖 Llama 3.2 分析結果</Text>

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4FC3F7" />
                <Text style={styles.loadingText}>AIが分析中... (30〜60秒)</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>⚠️ エラー</Text>
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
                    ⚠️ 模擬データに基づく参考情報です。実際の判断は公式機関の情報を確認してください。
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

// ─── メイン画面 ──────────────────────────────────────────────
export default function App() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchEvents = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/events`);
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      const data = await resp.json();
      setEvents(data.events);
    } catch (e) {
      Alert.alert(
        "接続エラー",
        `バックエンドに接続できません。\n\nBACKEND_URL を確認してください:\n${BACKEND_URL}\n\n詳細: ${e.message}`
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, []);

  const handleCardPress = (event) => {
    setSelectedEvent(event);
    setModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D1117" />

      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏙️ Urban Safety</Text>
        <Text style={styles.headerSubtitle}>AI 都市安全モニター</Text>
      </View>

      {/* サマリーバー */}
      {events.length > 0 && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>
            🔴 高 {events.filter(e => e.severity === "high").length}件　
            🟠 中 {events.filter(e => e.severity === "medium").length}件　
            🟢 低 {events.filter(e => e.severity === "low").length}件
          </Text>
        </View>
      )}

      {/* イベントリスト */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4FC3F7" />
          <Text style={styles.loadingText}>データ読み込み中...</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EventCard event={item} onPress={handleCardPress} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchEvents(true); }}
              tintColor="#4FC3F7"
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>イベントがありません</Text>
          }
        />
      )}

      {/* 分析モーダル */}
      <AnalysisModal
        event={selectedEvent}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

// ─── スタイル ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: "#0D1117" },
  header:           { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: "#161B22", borderBottomWidth: 1, borderBottomColor: "#30363D" },
  headerTitle:      { fontSize: 24, fontWeight: "700", color: "#E6EDF3" },
  headerSubtitle:   { fontSize: 13, color: "#8B949E", marginTop: 2 },
  summaryBar:       { backgroundColor: "#161B22", paddingVertical: 8, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "#30363D" },
  summaryText:      { fontSize: 13, color: "#8B949E" },
  listContent:      { padding: 12, gap: 10 },
  centerContainer:  { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText:      { color: "#8B949E", fontSize: 14 },
  emptyText:        { color: "#8B949E", textAlign: "center", marginTop: 40 },

  // カード
  card:             { backgroundColor: "#161B22", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#30363D" },
  cardHeader:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  categoryLabel:    { fontSize: 14, fontWeight: "700" },
  severityBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  severityText:     { fontSize: 11, fontWeight: "600" },
  cardText:         { fontSize: 14, color: "#C9D1D9", lineHeight: 20, marginBottom: 8 },
  cardFooter:       { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  cardMeta:         { fontSize: 11, color: "#8B949E" },
  riskRow:          { flexDirection: "row", alignItems: "center", gap: 8 },
  riskLabel:        { fontSize: 11, color: "#8B949E", width: 72 },
  riskBarContainer: { flex: 1, height: 6, backgroundColor: "#30363D", borderRadius: 3, overflow: "hidden", flexDirection: "row", alignItems: "center" },
  riskBarFill:      { height: "100%", borderRadius: 3 },
  riskBarLabel:     { position: "absolute", right: 0, fontSize: 10, fontWeight: "700" },

  // モーダル
  modalContainer:   { flex: 1, backgroundColor: "#0D1117" },
  modalHeader:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: "#161B22", borderBottomWidth: 1, borderBottomColor: "#30363D" },
  modalTitle:       { fontSize: 18, fontWeight: "700", color: "#E6EDF3" },
  closeBtn:         { padding: 6 },
  closeBtnText:     { fontSize: 18, color: "#8B949E" },
  modalBody:        { flex: 1, padding: 16 },
  eventInfo:        { backgroundColor: "#161B22", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#30363D" },
  eventInfoText:    { fontSize: 15, color: "#C9D1D9", lineHeight: 22, marginVertical: 8 },
  metaRow:          { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  metaChip:         { fontSize: 12, color: "#8B949E", backgroundColor: "#21262D", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  analysisSection:  { backgroundColor: "#161B22", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#30363D" },
  sectionTitle:     { fontSize: 15, fontWeight: "700", color: "#E6EDF3", marginBottom: 12 },
  loadingContainer: { alignItems: "center", padding: 24, gap: 12 },
  errorBox:         { backgroundColor: "#FF444415", borderRadius: 8, padding: 14, borderWidth: 1, borderColor: "#FF444440", gap: 8 },
  errorTitle:       { fontSize: 14, fontWeight: "700", color: "#FF4444" },
  errorText:        { fontSize: 13, color: "#C9D1D9" },
  retryBtn:         { backgroundColor: "#FF4444", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, alignSelf: "flex-start" },
  retryBtnText:     { color: "#fff", fontWeight: "600" },
  analysisResult:   { gap: 12 },
  analysisText:     { fontSize: 14, color: "#C9D1D9", lineHeight: 22 },
  disclaimerBox:    { backgroundColor: "#FF880015", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#FF880040" },
  disclaimerText:   { fontSize: 11, color: "#FF8800", lineHeight: 16 },
});
