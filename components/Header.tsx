/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useAgent } from '@/lib/state';
import c from 'classnames';

/**
 * Это новая, упрощенная версия шапки сайта.
 * Она показывает только имя текущего агента и больше ничего.
 */
export default function Header() {
  // Мы по-прежнему получаем имя текущего агента, чтобы его показать
  const { current } = useAgent();

  return (
    <header>
      {/* Этот div нужен, чтобы сохранить базовую структуру и стили */}
      <div className="roomInfo">
        <div className="roomName">
          {/* 
            Теперь это не кнопка, а просто заголовок.
            Он больше не будет вызывать выпадающее меню.
          */}
          <h1 className="static-title">
            {current.name}
          </h1>
        </div>
      </div>

      {/* 
        Кнопка настроек пользователя полностью удалена.
      */}
    </header>
  );
}
