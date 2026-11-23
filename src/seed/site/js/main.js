// Horno Alba — scripts de la web
document.addEventListener("DOMContentLoaded", function () {
  // Año actual en el pie de página
  var year = document.getElementById("year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
});
