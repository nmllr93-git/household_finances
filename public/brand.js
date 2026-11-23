// Larenest look (logo + colors): on unless turned off in Settings on this device. Runs before the page draws, so no flash.
(function () { var on = true; try { on = localStorage.getItem('fd-brand') !== '0'; } catch (e) {} document.body.classList.toggle('fd-brand', on); })();
