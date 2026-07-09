import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  useWindowDimensions,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { ScreenContainer } from "@/components/screen-container";

type GuideSection = {
  id: string;
  title: string;
  content: string[];
  tips?: string[];
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "overview",
    title: "📋 앱 개요",
    content: [
      "필름 재단 계산기는 인테리어 시공 시 필요한 필름의 소요량을 계산하고, 최적의 배치 방법을 제시하는 앱입니다.",
      "입력한 조각 정보를 바탕으로 필름 롤에 자동 배치하여 낭비를 최소화합니다.",
      "각 그룹별 배치 결과와 상세 견적서를 제공합니다.",
    ],
    tips: [
      "💡 팁: 정확한 조각 치수 입력이 배치 효율을 높입니다.",
      "💡 팁: 여러 그룹을 합쳐서 배치할 수 있습니다.",
    ],
  },
  {
    id: "input",
    title: "1️⃣ 조각 입력 (입력 탭)",
    content: [
      "앱의 첫 번째 탭에서 필름 조각 정보를 입력합니다.",
      "",
      "📌 그룹 추가:",
      "• '그룹 추가' 버튼으로 새로운 그룹을 생성합니다.",
      "• 각 그룹은 같은 위치나 용도의 조각들을 묶습니다.",
      "• 예: 거실, 침실, 주방 등",
      "",
      "📌 조각 입력:",
      "• 그룹 내에서 '조각 추가' 버튼으로 조각을 추가합니다.",
      "• 조각 ID: 식별용 이름 (예: A-1, 거실-벽)",
      "• 가로(mm): 조각의 가로 길이",
      "• 세로(mm): 조각의 세로 길이",
      "• 수량: 같은 크기의 조각 개수",
      "",
      "📌 그룹 합치기:",
      "• 같은 번호(1, 2, 3...)를 부여하면 해당 그룹들이 하나의 필름 롤에 함께 배치됩니다.",
      "• 번호 버튼으로 선택하거나 '해제' 버튼으로 제거합니다.",
    ],
    tips: [
      "💡 팁: 조각 ID는 나중에 재단 결과에서 식별하는 데 사용됩니다.",
      "💡 팁: 무늬 고정 옵션으로 조각의 방향을 고정할 수 있습니다.",
      "💡 팁: 그룹 합치기로 여러 공간의 조각을 한 롤에 배치하면 낭비를 줄일 수 있습니다.",
    ],
  },
  {
    id: "cutting",
    title: "2️⃣ 배치 결과 (재단 탭)",
    content: [
      "입력한 조각들이 필름 롤에 어떻게 배치되는지 시각적으로 확인합니다.",
      "",
      "📌 배치도 보기:",
      "• 각 그룹별 탭에서 배치 결과를 확인합니다.",
      "• 배치도는 필름 롤의 가로(1600mm) × 세로(배치된 높이) 를 나타냅니다.",
      "• 각 조각은 색상으로 구분되어 표시됩니다.",
      "",
      "📌 배치 정보:",
      "• 필름 길이(m): 필요한 필름의 총 길이",
      "• 필름 면적(㎡): 필요한 필름의 총 면적",
      "• 조각 목록: 배치된 조각들의 ID와 위치",
      "",
      "📌 그룹 합치기 배치:",
      "• '구분 없이 배치' 배지가 표시된 탭은 여러 그룹이 합쳐진 배치입니다.",
      "• 각 원본 그룹별로 차지한 면적 비율이 표시됩니다.",
    ],
    tips: [
      "💡 팁: 배치도를 스크린샷으로 저장하여 현장에서 참고할 수 있습니다.",
      "💡 팁: 조각이 배치되지 않으면 조각 크기를 확인하세요.",
    ],
  },
  {
    id: "estimate",
    title: "3️⃣ 견적서 (견적 탭)",
    content: [
      "배치 결과를 바탕으로 상세 견적서를 생성합니다.",
      "",
      "📌 견적 항목:",
      "• 그룹별 필름 길이와 면적",
      "• 자재비: 필름 단가 × 필요 면적",
      "• 시공비: 시공 단가 × 필요 면적",
      "• 부자재비: 추가 자재 비용",
      "",
      "📌 단가 설정:",
      "• 필름 단가(원/m²): 필름의 단위 가격",
      "• 시공 단가(원/m²): 시공의 단위 가격",
      "• 부자재 단가: 추가 자재의 가격",
      "",
      "📌 그룹 합치기 견적:",
      "• 합쳐진 그룹의 경우 각 원본 그룹별로 별도 행으로 표시됩니다.",
      "• 자재비는 각 그룹이 차지한 면적 비율로 배분됩니다.",
      "• 시공비는 각 그룹의 실제 조각 면적 기준으로 계산됩니다.",
      "",
      "📌 PDF 내보내기:",
      "• '견적서 PDF 다운로드' 버튼으로 견적서를 PDF 파일로 저장합니다.",
    ],
    tips: [
      "💡 팁: 단가를 변경하면 자동으로 견적이 다시 계산됩니다.",
      "💡 팁: PDF 견적서는 고객에게 제시하거나 보관용으로 사용할 수 있습니다.",
    ],
  },
  {
    id: "features",
    title: "🎯 주요 기능",
    content: [
      "📌 자동 배치 최적화:",
      "• 입력한 조각들을 필름 롤(가로 1600mm)에 최적으로 배치합니다.",
      "• 낭비를 최소화하여 비용을 절감합니다.",
      "",
      "📌 그룹 관리:",
      "• 여러 공간이나 용도별로 그룹을 나누어 관리합니다.",
      "• 각 그룹별 배치와 견적을 독립적으로 확인합니다.",
      "",
      "📌 그룹 합치기:",
      "• 같은 번호를 부여한 그룹들을 하나의 필름 롤에 함께 배치합니다.",
      "• 여러 공간의 조각을 효율적으로 배치할 수 있습니다.",
      "",
      "📌 무늬 고정:",
      "• 조각의 무늬 방향을 고정할 수 있습니다.",
      "• 시공 시 무늬 방향을 맞춰야 하는 경우 사용합니다.",
      "",
      "📌 상세 견적서:",
      "• 그룹별 자재비, 시공비, 부자재비를 상세히 계산합니다.",
      "• PDF 형식으로 내보낼 수 있습니다.",
    ],
  },
  {
    id: "tips",
    title: "💡 사용 팁",
    content: [
      "📌 효율적인 입력:",
      "• 같은 크기의 조각은 수량으로 입력하면 편합니다.",
      "• 조각 ID는 현장에서 식별하기 쉬운 이름으로 지정하세요.",
      "",
      "📌 배치 최적화:",
      "• 비슷한 크기의 조각들을 같은 그룹으로 묶으면 배치 효율이 좋습니다.",
      "• 그룹 합치기로 여러 공간을 한 롤에 배치하면 낭비를 줄일 수 있습니다.",
      "",
      "📌 견적 관리:",
      "• 단가를 미리 설정하면 여러 프로젝트에 빠르게 적용할 수 있습니다.",
      "• 부자재비를 정확히 입력하면 총 비용을 정확히 계산할 수 있습니다.",
      "",
      "📌 현장 활용:",
      "• 배치도를 스크린샷으로 저장하여 현장에서 참고하세요.",
      "• PDF 견적서를 고객에게 제시하여 신뢰도를 높입니다.",
    ],
  },
  {
    id: "faq",
    title: "❓ 자주 묻는 질문",
    content: [
      "Q: 조각이 배치되지 않습니다.",
      "A: 조각의 가로 또는 세로 길이가 필름 가로(1600mm)보다 크지는 않은지 확인하세요.",
      "",
      "Q: 그룹 합치기는 어떻게 사용하나요?",
      "A: 같은 번호를 부여한 그룹들이 하나의 필름 롤에 함께 배치됩니다. 여러 공간의 조각을 효율적으로 배치할 수 있습니다.",
      "",
      "Q: 무늬 고정은 무엇인가요?",
      "A: 조각의 무늬 방향을 고정하여 회전되지 않도록 합니다. 무늬 방향이 중요한 경우 사용하세요.",
      "",
      "Q: 견적서를 PDF로 저장할 수 있나요?",
      "A: 네, 견적 탭의 '견적서 PDF 다운로드' 버튼으로 PDF 파일로 저장할 수 있습니다.",
      "",
      "Q: 프로젝트를 저장할 수 있나요?",
      "A: 설정 탭에서 현재 프로젝트를 저장하고 불러올 수 있습니다.",
    ],
  },
];

export default function GuideScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";

  return (
    <ScreenContainer>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.contentContainer}
      >
        {/* 헤더 */}
        <View style={[styles.header, { backgroundColor: colors.primary + "15" }]}>
          <Text style={[styles.headerTitle, { color: colors.primary }]}>
            📖 사용 가이드
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
            필름 재단 계산기 사용 방법
          </Text>
        </View>

        {/* 가이드 섹션 */}
        {GUIDE_SECTIONS.map((section, index) => (
          <View key={section.id} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>
              {section.title}
            </Text>

            {/* 본문 */}
            {section.content.map((line, lineIndex) => (
              <Text
                key={lineIndex}
                style={[
                  styles.sectionContent,
                  { color: colors.text },
                  line.startsWith("•") && styles.bulletPoint,
                  (line.startsWith("Q:") || line.startsWith("A:")) &&
                    styles.faqText,
                ]}
              >
                {line}
              </Text>
            ))}

            {/* 팁 */}
            {section.tips && (
              <View style={[styles.tipsBox, { backgroundColor: colors.primary + "10" }]}>
                {section.tips.map((tip, tipIndex) => (
                  <Text
                    key={tipIndex}
                    style={[styles.tipText, { color: colors.primary }]}
                  >
                    {tip}
                  </Text>
                ))}
              </View>
            )}

            {/* 구분선 */}
            {index < GUIDE_SECTIONS.length - 1 && (
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            )}
          </View>
        ))}

        {/* 푸터 */}
        <View style={[styles.footer, { backgroundColor: colors.background }]}>
          <Text style={[styles.footerText, { color: colors.muted }]}>
            더 궁금한 점이 있으신가요?
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/settings" as any)}
            style={({ pressed }) => [
              styles.feedbackButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.feedbackButtonText, { color: colors.foreground }]}>
              설정으로 이동
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  sectionContent: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 8,
  },
  bulletPoint: {
    marginLeft: 16,
  },
  faqText: {
    fontWeight: "600",
    marginTop: 8,
  },
  tipsBox: {
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  tipText: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    marginVertical: 20,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    paddingTop: 20,
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    marginBottom: 12,
  },
  feedbackButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  feedbackButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
