const screens =
document.querySelectorAll(".screen");

document
.querySelectorAll("[data-go]")
.forEach(btn=>{

btn.onclick=()=>{

let target=
btn.dataset.go;

screens.forEach(s=>
s.classList.remove("active"));

document
.getElementById(target)
.classList.add("active");

window.scrollTo(0,0);

}

});

document
.getElementById("loginForm")
?.addEventListener(
"submit",
e=>{

e.preventDefault();

document
.getElementById("loginScreen")
.classList.remove("active");

document
.getElementById("homeScreen")
.classList.add("active");

});

document
.getElementById("sendReport")
?.addEventListener(
"click",
()=>{

alert(
"Reporte enviado correctamente"
);

document
.getElementById("trackingScreen")
.classList.add("active");

});
