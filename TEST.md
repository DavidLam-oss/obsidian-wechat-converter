# 结构化测试文件：核心格式与代码承载

## 文本样式与排版

这是一个正常的段落，用于测试正文的**默认字体**和**行高**。

---

![image.png](https://davidrepo-1348433231.cos.ap-guangzhou.myqcloud.com/img/202510260809542.png)

### 强调与引用
**加粗：** 我们需要**立即启动**项目。
*斜体：* *这是对重要概念的补充。*
~~删除线：~~ ~~旧的方案已经废弃。~~

==普通高亮：这是需要重点关注的内容。==

==**高亮中加粗：这是双重强调。**==

**==加粗中高亮：嵌套顺序相反也应正常。==**

行内代码中的高亮标记保持原样：`==这里不是高亮==`。

> 引用块用于区分核心观点和外部参考资料。
> *“最小可行产品（MVP）是工程化思维的关键。”*
> ==引用中的高亮也应使用相同的暖黄色。==

---

### 表格
| 设置项                     | 作用      | 我的配置                        |
| ----------------------- | ------- | --------------------------- |
| `folder`                | 同步目标文件夹 | `Wechat/David-Writing-Team` |
| `singleFileName`        | 同步目标文件名 | `素材库`                       |
| `dateSavedFormat`       | 日期格式    | `yyyy-MM-dd`（无时间）           |
| `wechatMessageTemplate` | 消息模板    | `---\n### 📅 {日期}\n{内容}`    |
| `highlight`             | 高亮测试    | ==表格中的高亮==                  |

# 一级标题
一级标题测试
## 二级标题
二级标题测试
### 三级标题
三级标题测试
#### 四级标题
四级标题测试

##### 五级标题
五级标题测试

###### 六级标题
六级标题测试

### Mermaid 思维导图

```mermaid
mindmap
  root((教育科研))
    三大要素
      研究方法
      解决问题
      产生新知识
    价值
      问题导向
      经验提炼
      可推广度
    能力养成
      框架性思维
      深度思考
      发现并解决问题
```

检查侧边栏预览中各节点文字是否垂直居中、没有飘出色块；复制或同步到公众号后，PNG 中的文字位置应与预览一致。


### 列表嵌套示例
1.  **第一步：** 准备数据
    * 清洗数据 (Python)
    * 标准化特征 (Scaling)
2.  **第二步：** 训练模型
    * 尝试不同的算法：
        * 线性回归
        * 随机森林
3.  **第三步：** 评估结果

-   无序列表也支持嵌套：
    -   子项 A
        1.  子子项 A.1
        2.  子子项 A.2

---

## 代码块测试区

### 1. 短代码块 (内联与简短函数)
内联代码示例：使用 `try...except` 进行异常捕获，然后执行 `print("Done")`。

```javascript
function calculate_area(radius) {
  return Math.PI * radius ** 2; // 这是注释
}
```

### 2. 公众号代码复制安全

```bash
git clone --branch master --depth 1 https://example.com/demo.git \
  && cd demo \
  && bash install.sh
```

复制到微信公众号编辑器后检查：

1. `git clone` 必须显示在第 1 行，代码块顶部不能出现空白行。
2. 行号应从真实代码首行开始，并与后续代码逐行对齐。
3. 从公众号编辑器再次复制上述命令，确认空格字符均为普通空格 `U+0020`，不包含 `U+00A0`。
4. 将复制出的命令粘贴到纯文本或字符检查工具中，确认续行、缩进和参数间空格无需手工替换。

### 3. 长代码
```python
# 文件名: data_processor.py
import pandas as pd
import numpy as np

def load_and_clean_data(file_path):
    """
    加载数据，处理缺失值和重复项。
    
    Args:
        file_path (str): 数据文件路径。
    
    Returns:
        pd.DataFrame: 清理后的数据框。
    """
    try:
        df = pd.read_csv(file_path)
    except FileNotFoundError:
        print(f"Error: File not found at {file_path}")
        return pd.DataFrame() # 返回空数据框作为止损
    
    initial_rows = len(df)
    
    # 1. 处理缺失值 (使用均值填充数值型，使用众数填充类别型)
    for col in df.columns:
        if df[col].dtype in ['int64', 'float64']:
            df[col].fillna(df[col].mean(), inplace=True)
        elif df[col].dtype == 'object':
            df[col].fillna(df[col].mode()[0], inplace=True)
            
    # 2. 删除重复行
    df.drop_duplicates(inplace=True)
    
    final_rows = len(df)
    
    print(f"数据清理完成：原始 {initial_rows} 行，现存 {final_rows} 行。")
    return df

# 这是一个长长的函数调用示例，旨在测试编辑器对长行和多行的支持能力。
if __name__ == '__main__':
    # 假设 'path/to/my_data.csv' 是一个实际的文件路径
    cleaned_data = load_and_clean_data(
        file_path="path/to/my_very_important_and_long_named_input_data_file_for_testing.csv"
    )
    
    if not cleaned_data.empty:
        # 进行一些简单的数据聚合操作
        print("\n--- 数据聚合 ---")
        summary = cleaned_data.groupby('Category')['Value'].agg(['mean', 'std', 'count'])
        print(summary)
    
    # 最后，添加一些额外的空行和缩进，确保代码块格式不会被破坏
    
    
    
    
    
    # 额外的代码行，用于测试代码块的最小高度要求和滚动支持
    for i in range(10):
        if i % 2 == 0:
            print(f"Processing item {i}")
        else:
            # 这是一个非常长的注释，旨在测试编辑器的水平滚动或自动换行能力。
            # 务必确认，即使是超长的注释行，也能在代码块中清晰显示。
            pass
```

---

## 图片卡片导出测试样本（C05 验收专区）

> 本区域用于在 Obsidian 转换器中切换为「图片卡片」模式，验证封面排版、分页装箱、单张复制与批量导出。

### 卡片封面与元数据

- **测试目的**：验证侧边栏「封面设置」Tab 中的大字版、居中版、极简版三式版式渲染。
- **推荐测试动作**：
  1. 在侧边栏切换为「封面设置」Tab，确认封面启用开关生效；
  2. 切换版式预设（大字版、居中版、极简版），检查封面主标题、副标题与作者文字排版与对齐；
  3. 悬停在封面缩略图右上角，点击「复制」按钮，验证系统剪贴板可粘贴出高清 `cover.png`（零落盘）；
  4. 点击卡片预览上方封面摘要 Chip，验证可直接跳转到侧边栏「封面设置」面板。

<!-- card:break -->

### 卡片分页指令与正文装箱

这是一个通过 `<!-- card:break -->` 手动显式断开的首张正文卡片。
- **孤行控制**：段落超长时按行拆分，末行不孤行；
- **标题联排**：标题不会被遗留在卡片底部（孤立标题自动推入下一卡片）；
- **排版 Token**：在侧边栏「排版 Token」Tab 调整字号、行高与页面边距，卡片应在 300ms 防抖后平滑重绘，左上角 ≤250ms 提示更新中；
- **三比例适配**：切换 3:4、1:1、9:16 比例，卡片宽高比及正文容量自适应调整。

<!-- card:break -->

### 代码与列表连续性

```typescript
// 验证卡片内代码块与行号显示
interface CardExportBatch {
  batchId: string;
  totalCards: number;
  scale: 1 | 2 | 3;
}
```

1. 有序列表第一项
2. 有序列表第二项
   - 嵌套无序列表子项 A
   - 嵌套无序列表子项 B
3. 有序列表第三项（跨卡片断页时保持序号连续）

> [!TIP]
> 导出弹窗测试要点：
> 1. 点击顶部导出图标打开导出弹窗，支持选择「全部」或预览「已勾选 N 页」；
> 2. 关闭弹窗后继续后台导出，再次点击顶部导出图标恢复原进度；
> 3. 点击「取消导出」即时终止后续调度，保留已保存图片；
> 4. 全部成功或用户取消时不写冗余清单，仅在有失败页时落盘 `export-manifest.json` 并支持失败页断点重试。

