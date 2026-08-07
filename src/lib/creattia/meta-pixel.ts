/**
 * El identificador del píxel de Meta.
 *
 * Es público por diseño: viaja en el JavaScript que recibe cualquier visitante,
 * así que no tiene sentido pedirlo por variable de entorno —era una variable más
 * para olvidarse de configurar, y de hecho el envío desde el servidor quedó
 * mudo por eso—. Lo que sí es secreto es el token de la API de conversiones, y
 * ese no está acá.
 *
 * Vive en un archivo propio para que la etiqueta del navegador y los envíos del
 * servidor no puedan quedar apuntando a píxeles distintos.
 */
export const META_PIXEL_ID = '2762379017476910';
