# AI Web Clipper 开发规范

## 一、分支策略

```
master          ← 稳定版本，每个功能完成后合并
  │
develop         ← 开发主分支，日常开发在此
  │
  ├── feature/ai-pipeline      ← AI 处理管线
  ├── feature/batch-clip       ← 批量剪切功能
  ├── feature/notion-tree      ← Notion 层级目录
  └── feature/auto-tag         ← 自动标签
```

## 二、日常开发流程

### 1. 开始新功能
```bash
# 从 develop 创建功能分支
git checkout develop
git pull origin develop
git checkout -b feature/功能名

# 开发完成后提交
git add .
git commit -m "feat: 功能描述"
git push origin feature/功能名
```

### 2. 功能完成后合并
```bash
# 合并到 develop
git checkout develop
git merge feature/功能名
git push origin develop

# 稳定后合并到 master
git checkout master
git merge develop
git push origin master
git tag -a v1.43.0 -m "添加AI批量剪切功能"
git push origin --tags
```

## 三、同步上游仓库（重要）

当原项目 webclipper/web-clipper 有更新时：

```bash
# 1. 获取上游更新
git fetch upstream

# 2. 切换到 master
git checkout master

# 3. 合并上游更新
git merge upstream/master

# 4. 解决冲突（如果有）
# 手动编辑冲突文件，然后：
git add .
git commit -m "merge: 同步上游更新"

# 5. 推送到你的仓库
git push origin master

# 6. 同步到 develop 分支
git checkout develop
git merge master
git push origin develop
```

### 定期同步建议
- 每周检查一次上游是否有重要更新
- 大功能开发前先同步，减少冲突

## 四、Commit 规范

```
feat:     新功能
fix:      Bug 修复
refactor: 代码重构
docs:     文档更新
style:    代码格式（不影响功能）
test:     测试相关
chore:    构建/工具变更
merge:    合并分支
```

示例：
```
feat: 添加 AI 内容结构化功能
fix: 修复 Notion 层级目录创建失败
refactor: 重构批量剪切队列逻辑
```

## 五、功能开发优先级

### Phase 1: MVP 核心功能
1. **AI 处理管线** - 接入 OpenAI，输出结构化 JSON
2. **Notion 层级写入** - 支持创建父子页面结构
3. **自动标签** - AI 生成标签并写入 Notion

### Phase 2: 批量功能
4. **目录页识别** - 解析侧边栏/导航链接
5. **批量剪切队列** - 并发控制 + 失败重试
6. **进度显示** - 批量任务进度 UI

### Phase 3: 扩展
7. **PDF 支持** - 保存链接 + 元数据
8. **图片处理优化** - 上传到 Notion
9. **其他平台导出** - Markdown/Joplin

## 六、关键代码位置

```
src/
├── common/backend/services/notion/   ← Notion 服务（重点修改）
│   ├── service.ts                    ← 核心 API 调用
│   └── types.ts                      ← 类型定义
│
├── extensions/extensions/            ← 扩展目录（添加新功能）
│   └── ai-organize/                  ← 新建：AI 整理扩展
│
├── service/                          ← 服务层
│   └── ai/                           ← 新建：AI 处理服务
│
└── pages/tool/                       ← UI 页面
```

## 七、注意事项

1. **API Key 安全**：不要把 OpenAI Key 放在扩展代码里
2. **Notion 限速**：平均 3 req/s，需要队列控制
3. **向后兼容**：保留原有功能，新功能作为可选项
4. **测试**：每个功能完成后在浏览器中实际测试
