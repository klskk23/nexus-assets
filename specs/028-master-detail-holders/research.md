# 调研：持有方主从化，四页拉齐

五个问题。第一个推翻了本轮任务的一半，第二三个是「子树」这件事在没有 `path` 列时怎么算，
第四个是骨架，第五个是一处已经发生的漂移。

---

## 一、类别页的分页与折叠**已经在了**

**结论：不是缺功能，是缺文档与一条测试。本轮把说反话的两处改掉，补上那条测试。**

`web/src/features/categories/CategoryTree.tsx` 现在就在用 `useFoldable`、`TreePager`、
`clampPage/pageCount/pageOfRoots`，`ROOTS_PER_PAGE = 12`，`flattenCategories` 也已经收
`isFolded` 参数。`git log -S` 指向 **025 那次提交 `8b1492a`**（「fields with their groups,
models under their vendors」）—— 抽共用件时顺手把类别页也接上了。

**但三处仍在说反话：**

| 位置 | 现在写着 | 事实 |
|---|---|---|
| `CategoryTree.tsx` 顶部注释 | 「No folding, and no chevrons to fold with」 | 下面 30 行就在渲染 chevron |
| `docs/rules/web-tables.md` | 「**不折叠。** …`CollapsibleTree` 当初就是这么被删的」 | 025 起就折叠了 |
| 同上 | 「未指定类别时 `<Navigate replace>` 到第一个根类别」 | 024 实机走查后已改成「默认显示第一条、地址不动」（`useMasterSelection`） |

**为什么没人发现**：阈值是 12，而演示库里**一共 4 个类别、3 个根、最大子项数 1** ——
分页条要根多于 12 才画，折叠要单节点子项多于 12 才折。两个控件都在，只是这份数据永远
碰不到它们。开发者据此认为功能缺失，是完全合理的推断。

**测试现状**：`web/tests/categories.test.tsx` 有「小的父节点默认展开，且折叠控件只出现在
有子类别的行上」，**折叠有守卫；分页没有**。本轮补一条根分页的测试。

> 这条改变了 spec 的 FR-031/032/033 的性质：它们**已经满足**，本轮的动作是
> **证明**（补测试）与**校正记录**（改两处注释与文档），而不是实现。
> FR-034（写明为什么反过来）仍然是实打实要写的。

---

## 二、持有方的子树计数：没有 `path` 列，怎么算

**结论：递归 CTE，一条 SQL 算出全部持有方的子树合计。**

类别能一次算完是因为它有**物化路径**（`categories.path`），`subtreeCounts` 拿
`AncestorIDs(path)` 在内存里上卷即可。**`holder_entities` 没有 path 列，只有 `parent_id`。**

三条路：

| 方案 | 代价 |
|---|---|
| **给持有方加 `path` 列** | 一次迁移 + 每次改上级都要重写子树的 path。为一个最深三层、总量几十的表引入类别那套维护负担，不划算 |
| **内存上卷**（读全部持有方，按 `parent_id` 往上爬） | 两次往返（先 `GROUP BY holder_id` 再读树）；且**与筛选那条 SQL 各有一份「子树」的定义**，两处会漂 |
| **递归 CTE**（选中） | 一条 SQL；`parent_id` 就是唯一事实；modernc 是完整 SQLite，`WITH RECURSIVE` 可用 |

```sql
WITH RECURSIVE tree(root, id) AS (
  SELECT id, id FROM holder_entities
  UNION ALL
  SELECT t.root, h.id FROM holder_entities h JOIN tree t ON h.parent_id = t.id
)
SELECT tree.root, count(a.id)
FROM tree LEFT JOIN assets a ON a.holder_type = 'entity' AND a.holder_id = tree.id
GROUP BY tree.root
```

**`LEFT JOIN` 不是 `JOIN`**：一个空仓库要出现在结果里并写着 0。
**`holder_type = 'entity'` 不能省**：设备也可以由账号持有，`holder_id` 单独一列会撞上同名 id。

**口径：不按状态过滤。** 这是与类别页**故意不同**的那一处 —— 类别问「有多少台能用的」
（`counts_as_available`），持有方问「这里放着多少台」，报废的设备还堆在那个仓库里。
这一条要写进 `docs/rules/`，理由见 spec FR-015。

---

## 三、`/assets` 的持有方筛选加「含下级」

**结论：同一棵递归 CTE，作为子查询进 WHERE。**

类别的写法是 `category_id IN (SELECT id FROM categories WHERE path LIKE ? || '%')`。
持有方没有 path，等价物就是 CTE：

```sql
holder_type = 'entity' AND holder_id IN (
  WITH RECURSIVE sub(id) AS (
    SELECT ?
    UNION ALL SELECT h.id FROM holder_entities h JOIN sub ON h.parent_id = sub.id
  ) SELECT id FROM sub
)
```

**于是「子树」在服务端有两处 SQL 写法**（计数一处、筛选一处）。这正是本项目反复踩的
那种坑，所以**不靠注释互相指认，靠一条测试把它们钉在一起**：

> `TestHolderCountsAgreeWithTheFilteredList` —— 对夹具里的**每一个**持有方，
> 断言 `counts[id] == len(list(holder_id=id, holder_include_descendants=true))`。
> 两边各自算错的可能性存在，**算成同一个错的可能性不存在**。

这条测试就是 spec SC-002 在服务端的落点；前端那一半（行尾的数 = 链接文案里的数 =
列表行数）另有 DOM 测试。

**默认值**：类别的 `include_descendants` 默认 **true**（`DefaultQuery(..., "true") != "false"`）。
持有方**默认 false**，因为 `holder_id` 这个参数在既有的资产筛选栏里一直是「就这一个持有方」，
改默认值会**静默改变**所有现存链接与筛选栏的含义。新行为只在显式带上参数时发生。

---

## 四、骨架要不要改（第四个调用方）

**结论：预期零改动。逐条核对如下；若实现中打脸，按 FR-035 报告。**

| 持有方要的 | 谁负责 | 骨架要改吗 |
|---|---|---|
| 两栏栅格、窄屏塌一栏 | `MasterDetail` | 否 |
| 选中写地址、陈旧 id 与空列表分开 | `useMasterSelection` | 否 |
| 三种类型混在一棵树里 | 调用页的行模型 | 否 —— 钩子只认 `ids: string[]` |
| 页头那行「默认库存点：X」 | 调用页 | 否 |
| 右栏一个非只读的按钮 | 调用页渲染的 `detail` 节点 | 否 |

`useMasterSelection(ids, id)` 的 `ids` 要传**全部**持有方而不是本页的 —— 025 已经写过
这条：传当前页会让翻页后选中项被判成「不存在」。这不是骨架缺陷，是调用方传错参数。

---

## 五、一处已经发生的漂移：`Rail` 有两份

**结论：持有方用 `Rail`。类别页那份内联的本轮不动，但记在这里。**

`features/common/Rail.tsx` 是 025 抽出的左栏框架（搜索框 + 行 + 分页 + 脚部按钮）。
**字段页与型号页用它；`CategoryTree` 自己内联了一份等价的 markup。**

差别在空态：`CategoryTree` 在没有行时渲染 `<Empty>` **取代** `<ul>`，而 `Rail` 只会把
children 塞进 `<ul>`，表达不了这个替换。所以那次没切过去，大概率是这个原因。

**本轮不动它**：把空态塞进 `Rail` 属于改骨架（FR-035 说要报告而不是顺手改），
而它没有任何用户可见的收益 —— 两份 markup 今天渲染结果相同。
**风险记在这里**：谁将来改 `Rail` 的搜索框，类别页不会跟着变，而那时没人会记得有两份。

持有方作为 `Rail` 的第三个使用者，若发现它也需要「空态取代列表」，那就说明这个缺口是
**真的**而不是类别页一家的偏好 —— 那时再按 FR-035 报告并改骨架，一次改对。

---

## 附：本轮不碰

- **`holder_entities.archived_at`**：有列、读取时扫、没有任何代码写过（024 决策 10 对
  类别下过同样的判断）。
- **把账号并进这棵树**：设备可以由账号持有，但那一侧不在这一页管理。
- **`/holders` 的信封形状**：树读数组形态（与 `/categories` 一致），
  信封形态（带 `q/offset/limit`）在别处仍有使用者，不动。
