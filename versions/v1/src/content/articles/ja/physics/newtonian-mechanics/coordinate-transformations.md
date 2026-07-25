---
articleId: ja-physics-coordinate-transformations
locale: ja
title: 座標系の変換
slug: coordinate-transformations
subject: physics
category: newtonian-mechanics
concepts:
  - id: physics.newtonian-mechanics.coordinate-transformations
authors:
  - atlas-physics-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  空間と時間の定義から、許される座標系の変換は等長写像(計量を保つ変換)であって、特に時間についてはそのうち向きも保つものに限られる。すなわち、空間については
  、時間については 、全体で が許される変換となる。 …
difficulty: intermediate
estimatedMinutes: 15
tags:
  - 座標系の変換
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

空間と時間の定義から、許される座標系の変換は等長写像(計量を保つ変換)であって、特に時間についてはそのうち向きも保つものに限られる。すなわち、空間については$\mathrm{E}(3)=\mathbb{R}^3\rtimes\mathrm{O}(3)$、時間については$\mathrm{SE}(1)=\mathbb{R}$、全体で$\mathrm{E}(3)\times\mathrm{SE}(1)$が許される変換となる。

空間と時間の具体的性質を規定することによる空間と時間の定義と、許される座標系の変換のセットを決めることによる空間と時間の定義とは等価である。

以下では、空間と時間の座標系の変換として許されるものと禁止されるものを具体的に見た後、許される変換のもとで質点の位置・速度・加速度がどのように変換するかを確認する。

### 空間の座標系の変換

空間の座標系について許される変換は、

空間並進 $\boldsymbol{r}'(t)=\boldsymbol{r}(t)-\boldsymbol{b}(t)$ 空間回転 $\boldsymbol{r}'(t)=R^{-1}(t)\boldsymbol{r}(t)\ (\det R=1)$ 空間反転 $\boldsymbol{r}'(t)=-\boldsymbol{r}(t)$

に限られる。並進は原点をずらし、回転は原点はそのままに原点周りに基底を回転させる。反転は空間の次元が奇数であることから回転には含まれず、鏡映は反転と回転の合成によって実現される。

$R(t)$や$\boldsymbol{b}(t)$は時刻に依存する$C^2$級のものであれば任意に選べることに注意する。($C^2$級に限られることは運動方程式の要請より従う。)

### 時間の座標系の変換

時間の座標系について許される変換は、

時間並進 $t'=t-T\ (Tは定数)$

に限られる。

### 禁止される変換

空間と時間の座標系について禁止される変換としては、

スケール変換 $\boldsymbol{r}'(t)=\frac{1}{\lambda}\boldsymbol{r}(t)\ (|\lambda|\neq1),\ t'=\frac{1}{\mu}t\ (\mu\neq1)$ 時間反転 $t'=-t$ 位置に依存する時間変換 $t'=t-T(\boldsymbol{r})$ その他一様でない一般の座標変換 $\boldsymbol{r}'=\boldsymbol{r}'(\boldsymbol{r}),\ t'=t'(t)$

がある。

スケール変換は一様だが計量を一定に保たず、時間反転は時間の向きを保たず、位置に依存する時間変換はある座標系で同時であるイベントが別の座標系では別時刻となって同時性を破り、一様でない一般の座標変換は一様性に反するため、これらは禁止される。

### 質点の位置・速度・加速度の変換

空間座標系の変換に対して、質点の位置・速度・加速度はそれぞれ $\boldsymbol{r}'=R^{-1}\boldsymbol{r}-\boldsymbol{b}$ $\boldsymbol{v}'=R^{-1}\boldsymbol{v}+\dot{(R^{-1})}\boldsymbol{r}-\dot{\boldsymbol{b}}$ $\boldsymbol{a}'=R^{-1}\boldsymbol{a}+2\dot{(R^{-1})}\boldsymbol{v}+\ddot{(R^{-1})}\boldsymbol{r}-\ddot{\boldsymbol{b}}$ と変換する(簡単のため$R$は$\det R=-1$も含めた直交変換とした)。時間座標系の変換に対しては質点の位置・速度・加速度は変化しない。
