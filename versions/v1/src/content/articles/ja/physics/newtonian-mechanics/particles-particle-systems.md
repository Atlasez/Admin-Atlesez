---
articleId: ja-physics-particles-particle-systems
locale: ja
title: 質点・質点系
slug: particles-particle-systems
subject: physics
category: newtonian-mechanics
concepts:
  - id: physics.newtonian-mechanics.particles-particle-systems
authors:
  - atlas-physics-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary: 質点・質点系 質点は、原理において質点の運動 、慣性質量 、チャージ(荷)
  (チャージは1つとは限らない)の組として定義される。これは自然との対応の観点からは、物体の位置と運動と力の大きさに関わる量以外の大きさなどといっ…
difficulty: intermediate
estimatedMinutes: 15
tags:
  - 質点・質点系
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 質点・質点系

質点は、原理において質点の運動$\boldsymbol{r}(t)$、慣性質量$m_\mathrm{I}$、チャージ(荷)$q$(チャージは1つとは限らない)の組として定義される。これは自然との対応の観点からは、物体の位置と運動と力の大きさに関わる量以外の大きさなどといった他の自由度や特徴を捨象した理想的な対象である。

質点系は1つ以上の質点の組である。特に複数の質点からなる系を多質点系や多粒子系と呼ぶ。質点の個数は有限個に限らず、可算無限個あるいは非可算無限個あっても良い。

### 場による表現

質点系は運動と質量とチャージの組としての質点の組として表す他に、各地点と各時点において値を持つ場としても等価に表現できる。特に非可算無限個の質点系を表現するには場(あるいはそれと等価な方法)を用いる必要がある。それ以外の有限個の質点系や可算無限個の質点系に対しても使える。

ある3次元の空間領域$V$について、時刻$t$における$V$内の質量あるいはチャージの総和を$Q_V(t)$とおく。$\int_V\rho(\boldsymbol{r},t)\dd{V}=Q_V(t)$を満たす$\rho(\boldsymbol{r},t)$を密度と呼ぶ。特に質量に対して質量密度、電荷に対して電荷密度と呼び、添え字を用いてそれぞれ$\rho_\mathrm{m},\rho_\mathrm{e}$のように区別することもある。

ある2次元の空間領域$S$について、時刻$t$における単位時間あたりに$S$を通過する質量あるいはチャージの総和を$\Phi(t)$とおく。これを流束と呼び、特に質量に対して質量流束、電荷に対して電流という。また時刻$t_1$から$t_2$の間に時間変化しない$S$を通過するチャージの総和$\int_{T=[t_1,t_2]}\Phi(t)\dd{t}$を$Q_{S,T}(t)$とおく。$\int_S\boldsymbol{j}(\boldsymbol{r},t)\cdot\dd{\boldsymbol{S}}=\Phi(t)$、言い換えれば$\int_T\int_S\boldsymbol{j}(\boldsymbol{r},t)\cdot\dd{\boldsymbol{S}}\dd{t}=Q_{S,T}(t)$を満たす$\boldsymbol{j}(\boldsymbol{r},t)$を流束密度と呼ぶ。特に質量に対して質量流速密度、電荷に対して電流密度という。

$\boldsymbol{j}_m=\rho_m\boldsymbol{v}(\boldsymbol{r},t)$を満たす$\boldsymbol{v}(\boldsymbol{r},t)$を速度場と呼ぶ。質量密度や速度場が連続分布であってもそれは連続体とは限らず、連続体といえば連続変形するよう拘束条件を課したものを指すことに注意する。

### 保存則と連続の式

質点は生成したり消滅したりしないので、空間全体にわたる質量の総和やチャージの総和は保存する。

特に$\rho$が$t$について$C^1$、$\boldsymbol{v}$が$\boldsymbol{r}$について$C^1$であるとき、$\int_V\dv{\rho(\boldsymbol{r},t)}{t}\dd{V}=\dv{}{t}\int_V\rho(\boldsymbol{r},t)\dd{V}=-\int_{\partial V}\boldsymbol{j}(\boldsymbol{r},t)\cdot\dd{\boldsymbol{S}}=-\int_V\divergence\boldsymbol{j}(\boldsymbol{r},t)\dd{V}$、つまり$\int_V(\dv{\rho}{t}+\divergence\boldsymbol{j})\dd{V}=0$が$V$の取り方によらずに成り立つ。よって$\dv{\rho}{t}+\divergence\boldsymbol{j}=0$を得る。これを連続の式という。
