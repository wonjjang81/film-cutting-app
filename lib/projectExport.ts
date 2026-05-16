import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { SavedProject } from '@/lib/filmContext';

/**
 * 프로젝트를 JSON 파일로 내보내기
 */
export async function exportProjectAsFile(project: SavedProject): Promise<void> {
  try {
    // 공유 가능 여부 확인
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('이 기기에서는 파일 공유가 지원되지 않습니다.');
    }

    // JSON 데이터 생성
    const jsonData = JSON.stringify(project, null, 2);

    // 파일명 생성 (프로젝트명_날짜.json)
    const timestamp = new Date().getTime();
    const fileName = `${project.name}_${timestamp}.json`;
    const filePath = `${FileSystem.documentDirectory ?? ''}${fileName}`;

    // JSON 파일 저장
    await FileSystem.writeAsStringAsync(filePath, jsonData, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // 파일 공유
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/json',
      dialogTitle: '프로젝트 내보내기',
    });
  } catch (error) {
    console.error('프로젝트 내보내기 오류:', error);
    throw error;
  }
}

/**
 * 모든 저장된 프로젝트를 JSON 파일로 내보내기
 */
export async function exportAllProjectsAsFile(projects: SavedProject[]): Promise<void> {
  try {
    // 공유 가능 여부 확인
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('이 기기에서는 파일 공유가 지원되지 않습니다.');
    }

    // JSON 데이터 생성
    const jsonData = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        projectCount: projects.length,
        projects,
      },
      null,
      2
    );

    // 파일명 생성
    const timestamp = new Date().getTime();
    const fileName = `필름재단_모든프로젝트_${timestamp}.json`;
    const filePath = `${FileSystem.documentDirectory ?? ''}${fileName}`;

    // JSON 파일 저장
    await FileSystem.writeAsStringAsync(filePath, jsonData, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // 파일 공유
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/json',
      dialogTitle: '모든 프로젝트 내보내기',
    });
  } catch (error) {
    console.error('모든 프로젝트 내보내기 오류:', error);
    throw error;
  }
}

/**
 * JSON 파일에서 프로젝트 불러오기
 */
export async function importProjectFromFile(): Promise<SavedProject | null> {
  try {
    // 파일 선택
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
    });

    if (result.canceled) {
      return null;
    }

    const file = result.assets[0];
    if (!file.uri) {
      throw new Error('파일을 읽을 수 없습니다.');
    }

    // 파일 내용 읽기
    const content = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // JSON 파싱
    const data = JSON.parse(content);

    // SavedProject 타입 검증
    if (!isValidSavedProject(data)) {
      throw new Error('유효하지 않은 프로젝트 파일입니다.');
    }

    return data as SavedProject;
  } catch (error) {
    console.error('프로젝트 불러오기 오류:', error);
    throw error;
  }
}

/**
 * JSON 파일에서 여러 프로젝트 불러오기
 */
export async function importMultipleProjectsFromFile(): Promise<SavedProject[]> {
  try {
    // 파일 선택
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
    });

    if (result.canceled) {
      return [];
    }

    const file = result.assets[0];
    if (!file.uri) {
      throw new Error('파일을 읽을 수 없습니다.');
    }

    // 파일 내용 읽기
    const content = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // JSON 파싱
    const data = JSON.parse(content);

    // 단일 프로젝트인 경우
    if (isValidSavedProject(data)) {
      return [data as SavedProject];
    }

    // 여러 프로젝트인 경우 (exportedAt, projectCount, projects 필드 확인)
    if (data.projects && Array.isArray(data.projects)) {
      const validProjects = data.projects.filter(isValidSavedProject);
      if (validProjects.length === 0) {
        throw new Error('유효한 프로젝트가 없습니다.');
      }
      return validProjects as SavedProject[];
    }

    throw new Error('유효하지 않은 프로젝트 파일입니다.');
  } catch (error) {
    console.error('여러 프로젝트 불러오기 오류:', error);
    throw error;
  }
}

/**
 * SavedProject 타입 검증
 */
function isValidSavedProject(data: any): boolean {
  if (!data || typeof data !== 'object') return false;

  // 필수 필드 확인
  if (
    typeof data.id !== 'string' ||
    typeof data.name !== 'string' ||
    typeof data.savedAt !== 'number' ||
    !Array.isArray(data.groups) ||
    typeof data.materialCostPerM !== 'number' ||
    typeof data.constructionPricePerM2 !== 'number'
  ) {
    return false;
  }

  // groups 배열의 각 요소가 FilmGroup 타입인지 확인
  return data.groups.every((group: any) => {
    return (
      typeof group.groupId === 'string' &&
      typeof group.groupName === 'string' &&
      typeof group.brand === 'string' &&
      Array.isArray(group.pieces)
    );
  });
}

/**
 * 프로젝트 파일 정보 추출 (미리보기용)
 */
export function extractProjectInfo(project: SavedProject): {
  name: string;
  groupCount: number;
  pieceCount: number;
  savedDate: string;
} {
  const pieceCount = project.groups.reduce((sum, g) => sum + g.pieces.length, 0);
  const savedDate = new Date(project.savedAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    name: project.name,
    groupCount: project.groups.length,
    pieceCount,
    savedDate,
  };
}
