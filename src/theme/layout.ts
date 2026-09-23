/**
 *   frame   : 375x812px   최소 디바이스 사이즈, 이걸 기준으로 그린다
 *   Columns : 3column
 *   Margin  : 24px        화면 좌우 여백
 *   Gutter  : 16px        컬럼 사이 간격
 
 *   <View className="px-margin">        화면 좌우 여백
 *   <View className="flex-row gap-gutter">  컬럼 사이 간격
 */
export const layout = {
  margin: "24px",
  gutter: "16px",
};


export const baseFrame = { width: 375, height: 812 } as const;
export const columns = 3;
