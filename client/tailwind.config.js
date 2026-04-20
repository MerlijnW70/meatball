/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0A",
        paper: "#FFFCF2",
        hot: "#FF3D2E",
        pop: "#FFE14D",
        mint: "#00D2A0",
        sky: "#4D7CFF",
        bruise: "#B87DFF",
      },
      fontFamily: {
        display: ['"Archivo Black"', "system-ui", "sans-serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        brut: "6px 6px 0 0 #0A0A0A",
        brutLg: "10px 10px 0 0 #0A0A0A",
        brutSm: "3px 3px 0 0 #0A0A0A",
      },
      borderWidth: {
        3: "3px",
        5: "5px",
      },
    },
  },
  plugins: [],
};
