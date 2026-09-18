/**
 * トレーナーの登録簿。新しい練習を追加するときはここに 1 行足す。
 * 実装の作り方は docs/ADDING_A_TRAINER.md を参照。
 */
import { TrainerRegistry } from "../core/trainer";
import { noteAttackTrainer } from "./note-attack";
import { attackQualityTrainer } from "./attack-quality";
import { lipSlurTrainer } from "./lip-slur";
import { tonguingTrainer } from "./tonguing";

export const registry = new TrainerRegistry()
  .register(noteAttackTrainer)
  .register(attackQualityTrainer)
  .register(lipSlurTrainer)
  .register(tonguingTrainer);
