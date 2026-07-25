---
articleId: ja-physics-momentum-impulse
locale: ja
title: 運動量と力積
slug: momentum-impulse
subject: physics
category: newtonian-mechanics
concepts:
  - id: physics.newtonian-mechanics.momentum-impulse
authors:
  - atlas-physics-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary: 質点の運動量と力積 質点 の運動方程式を時間積分することを考える。時刻 から までの運動について、 の両辺を で積分すると、 より、 を得る。 …
difficulty: intermediate
estimatedMinutes: 10
tags:
  - 運動量と力積
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 質点の運動量と力積

質点$i$の運動方程式を時間積分することを考える。時刻$t_1$から$t_2$までの運動について、$m_i\dvtwo{\boldsymbol{r}_i}{t}=\boldsymbol{F}_i(t)$の両辺を$t$で積分すると、

$$
\int_{t_1}^{t_2}m_i\dvtwo{\boldsymbol{r}_i}{t}\dd t=\int_{t_1}^{t_2}\boldsymbol{F}_i\dd t
$$

より、

$$
m_i\boldsymbol{v}_i(t_2)-m_i\boldsymbol{v}_i(t_1)=\int_{t_1}^{t_2}\boldsymbol{F}_i\dd t
$$

を得る。 ここで、左辺は境界時刻$t_1,\,t_2$における質点$i$の量$\boldsymbol{p}_i:=m_i\boldsymbol{v}_i$の差であり、これを質点$i$の運動量と呼ぶ。右辺は力の時間積分であり、この量$\boldsymbol{I}_i^{t_1\to t_2}=\int_{t_1}^{t_2}\boldsymbol{F}_i\dd t$を質点$i$に働く力積と呼ぶ。すなわち、

$$
\boldsymbol{p}_i(t_2)-\boldsymbol{p}_i(t_1)=\boldsymbol{I}_i^{t_1\to t_2}。
$$

運動量の時間微分は$\dv{\boldsymbol{p}_i}{t}=\boldsymbol{F}_i$で与えられる。これは運動方程式の書き換えとなっている。

### 質点系の全運動量と全力積

質点系についても、質点系の全運動量$\boldsymbol{P}=\sum_i\boldsymbol{p}_i$を定義すれば、運動方程式の両辺の和を取ることで質点の場合と同様に

$$
\begin{aligned}
\boldsymbol{P}(t_2)-\boldsymbol{P}(t_1)
&=\sum_i\boldsymbol{p}_i(t_2)-\sum_i\boldsymbol{p}_i(t_1) \\
&=\sum_i\left(\boldsymbol{p}_i(t_2)-\boldsymbol{p}_i(t_1)\right) \\
&=\sum_i\int_{t_1}^{t_2}\boldsymbol{F}_i\dd t \\
&=\int_{t_1}^{t_2}\left(\sum_i\boldsymbol{F}_i\right)\dd t \\
&=\int_{t_1}^{t_2}\boldsymbol{F}_{\mathrm{all}}\dd t \\
&=\int_{t_1}^{t_2}\left(\boldsymbol{F}_{\mathrm{all}}^\mathrm{ex}+\boldsymbol{F}_{\mathrm{all}}^\mathrm{iner}\right)\dd t
\end{aligned}
$$

が成り立つ。最後の等号において作用反作用の法則の一部$\boldsymbol{F}_{ij}=-\boldsymbol{F}_{ji}$を用いた。最右辺は質点系に働く広義外力（狭義外力と慣性力）の時間積分であり、この量$\boldsymbol{I}_{\mathrm{all}}^{t_1\to t_2}:=\int_{t_1}^{t_2}(\boldsymbol{F}_{\mathrm{all}}^\mathrm{ex}+\boldsymbol{F}_{\mathrm{all}}^\mathrm{iner})\dd t$を質点系に働く全力積と呼ぶ。

全運動量の時間微分についても質点の場合と同様の関係$\dv{\boldsymbol{P}}{t}=\dv{}{t}(\sum_i\boldsymbol{p}_i)=\sum_i\dv{\boldsymbol{p}_i}{t}=\sum_i\boldsymbol{F}_i=\boldsymbol{F}_{\mathrm{all}}=\boldsymbol{F}_{\mathrm{all}}^\mathrm{ex}+\boldsymbol{F}_{\mathrm{all}}^\mathrm{iner}$が成り立つ。
