# 上架到社区市场（awesome-dsh-plugin）

本机安装的 `dshmarket`（Visual plugin market）只允许安装精选列表内的来源，列表来自
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。
收录方式是**一个 PR、一个文件**，没有后台、没有审核表单。

## 前置条件（都是硬性的）

- [ ] 仓库已推到 GitHub，**创建满 1 天**（CI 自动检查）
- [ ] 仓库根 `package.json` 声明 `dsh.bundle`（本仓库已满足）
- [ ] 仓库根有 `cordis.patch.yml`（本仓库已满足）
- [ ] 仓库带 `dsh-plugin` topic
- [ ] 图标是 GitHub 托管的**位图**（本仓库 `assets/icon-180.png`；SVG 不行）
- [ ] 描述属实、不带营销词（维护者会对着代码核对）

## 自动模式（推荐）

把 GitHub PAT（只勾 `repo`）存成 `C:\Users\26831\.dsh\github-token.txt`，然后：

```bash
node scripts/auto-release.mjs --check   # 只读，报告会做什么
node scripts/auto-release.mjs           # 建仓库、push、fork、写条目、开 PR
```

排程任务每 12 小时会自动跑一次；仓库未满 24 小时时只推代码，满 24 小时后的下一次自动开 PR。

## 手动模式

1. 在 GitHub 新建仓库 `dsh-session-recap`，把本目录推上去。
2. 仓库 Settings → Topics 添加 `dsh-plugin`。
3. Fork <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>。
4. 把 `submission/awesome-dsh-plugin.template.yml` 复制为
   `data/plugins/<你的owner>__dsh-session-recap.yml`，替换所有 `<owner>`。
5. 提 PR，标题写 `Add dsh-session-recap (usage)`；合并后站点与市场通常一天内自动收录。

不要手写 `npm:` 字段——校验会拒绝；npm 映射由 registry 自动采集。
不要手工编辑两个 README——它们由 `data/plugins/*.yml` 生成。

## 发布 npm 之后

条目本身不写版本号，但市场里的「安装」会走 npm。所以顺序是：先 `npm publish`，再提 PR；
否则列表里会出现一条装不上的条目。若包名被占用，改 `package.json` 与 `cordis.patch.yml`
的 `name`，重跑 `pnpm run index`，再改本模板里的仓库名。

## 官方市场的另一条路

DSH 自带的官方市场（`@deepseek-ai/dsh-experimental-plugin-market-bundle`）还在筹建，
本机 profile 里默认未启用。它读的是 **format-1 索引**，仓库里的 `market/index.json`
已按该格式生成并通过官方校验器；等官方市场开放索引源或征集时，直接提交这份索引。
