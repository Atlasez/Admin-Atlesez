---
articleId: ja-physics-conservation-of-momentum
locale: ja
title: 運動量保存則
slug: conservation-of-momentum
subject: physics
category: newtonian-mechanics
concepts:
  - id: physics.newtonian-mechanics.conservation-of-momentum
authors:
  - atlas-physics-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary: 運動量変化と力積の関係から保存則を導くことを考える。 …
difficulty: intermediate
estimatedMinutes: 10
tags:
  - 運動量保存則
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

運動量変化と力積の関係から保存則を導くことを考える。

### 質点の運動量保存則

まず、$\dv{\boldsymbol{p}_i}{t}=\boldsymbol{F}_i$より、$\boldsymbol{F}_i=\boldsymbol{0}$のとき、$\dv{\boldsymbol{p}_i}{t}=\boldsymbol{0}$すなわち$\boldsymbol{p}_i(t_2)-\boldsymbol{p}_i(t_1)=\boldsymbol{0}$となり$\boldsymbol{p}_i$は保存する。これを運動量保存則という。

$\boldsymbol{p}_i(t_2)-\boldsymbol{p}_i(t_1)=\int_{t_1}^{t_2}\boldsymbol{F}_i\dd t$が保存則となることは、ある量$\boldsymbol{A}_i$が存在して右辺が$\int_{t_1}^{t_2}\boldsymbol{F}_i\dd t=\boldsymbol{A}(t_2)-\boldsymbol{A}(t_1)$と書けること、すなわち$\boldsymbol{F}_i=\dv{\boldsymbol{A}_i}{t}$なる$\boldsymbol{A}_i$が存在するということと同値である。しかし、一般に$\boldsymbol{F}_i$は各質点の運動や観測者の座標系を通して時間に陰に依存し、また時間に陽に依存しないので、$\int_{t_1}^{t_2}\boldsymbol{F}\dd t$は粒子の運動に依存し、境界の時間のみで書くことができない。すなわちそのような$\boldsymbol{A}_i$は一般に存在しない。一方で、$\boldsymbol{F}_i$が各質点の位置や速度などに依存しないと見なせる場合、そうした近似を採用すると時間に陰にも依存しなくなり$\boldsymbol{F}_i$は定数となって$\boldsymbol{Q}_i=-\int_{t_0}^{t}\boldsymbol{F}_i\dd t$が各質点の運動によらず定義でき、$\boldsymbol{p}_i+\boldsymbol{Q}_i$が保存する。$\boldsymbol{F}_i$が時間に陽に依存する拘束力はここでは考えない。

### 質点系の運動量保存則

質点の場合と同様に、$\dv{\boldsymbol{P}}{t}=\boldsymbol{F}_{\mathrm{all}}^\mathrm{ex}$より、$\boldsymbol{F}_{\mathrm{all}}^\mathrm{ex}=\boldsymbol{0}$のとき、$\dv{\boldsymbol{P}}{t}=\boldsymbol{0}$すなわち$\boldsymbol{P}(t_2)-\boldsymbol{P}(t_1)=\boldsymbol{0}$となり$\boldsymbol{P}$は保存する。これを質点系の運動量保存則という。

$\boldsymbol{F}_{\mathrm{all}}^\mathrm{ex}$が各質点の位置や速度などに依存しないと見なせる場合、そうした近似を採用すると$\boldsymbol{Q}_{\mathrm{all}}=-\int_{t_0}^{t}\boldsymbol{F}_{\mathrm{all}}^\mathrm{ex}\dd t$が質点の運動によらず定義でき、$\boldsymbol{P}+\boldsymbol{Q}_{\mathrm{all}}$が保存する。
