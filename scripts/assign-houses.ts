import 'dotenv/config';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../src/convex/_generated/api.js';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

const raw = `Heracles	Wukong	Ixbalam	Setna
G10-1 Adeline Huang	G10-2 Vivian Chang	G9 Cyrus Shi	G9 Leroy Chang
G10-1 Angus Yang	G10-1 Marcus Tse	G10-1 Katrina Hong	G10-2 Jamie Liu
G10-1 Elena Hua	G10-1 Chloe Su	G9 Joson Liao	G9 Tommy Hoang
G10-1 Emily Yen	G10-2 Celeste Chen	G10-1 Phoebe Chen	G10-1 Agnes Tseng
G10-1 Jeremy Chien	G10-2 Alan Chen	G10-1 Carlos Lai	G10-1 Eric Lin
G10-1 Lucas Liu	G10-2 Austin Kuo	G10-2 Tina Chen	G10-1 Ren Jie Wang
G10-1 Ricky Wang	G10-2 Andrew Lin	G10-1 Eric Tsai	G10-1 Jay Lu
G10-1 Wendy Dong	G10-2 Amber Lien	G9 Jasper Chung	G9 Gavin Zhou
G10-2 Amber Lin	G10-2 Cherry Li	G10-1 Janice Li	G10-1 Alicia Yu
G10-2 Annie Chang	G10-1 Teddy Chang	G10-1 Emma Lin	G10-2 Anna Chao
G10-2 Ethan Li	G10-2 Willis Chan	G10-1 Sherwin Chang	G10-1 Kyle Fu
G10-2 Sol Lee	G10-2 Evangeline Chen	G10-1 Yuan-Yuan Hung	G10-1 Ellie Huang
G10-2 Steven Li	G10-2 Jasper Yang	G10-1 Louis Lai	G10-1 Casper Chen
G11-1 Chandler Wu	G11-2 JJ Wu	G11-1 Jana Westheim	G11-2 Becky Mao
G11-1 Ted Tsai	G11-1 Olivia Wang	G11-2 Emma Tu	G11-IB Sunny Wang
G11-1 Zaire Song	G11-1 Jackle Yu	G11-2 Joyce Mao	G11-IB Lucas Chu
G11-2 Alderson Chiu	G11-IB Adriana Li Chen	G11-2 Marjorie Tsai	G11-1 Gina Huang
G11-2 Angel Chuang	G11-1 Betty Chien	G10-2 Alfred Tseng	G10-2 Brian Liu
G11-2 Ivy Chang	G11-1 Roselyn Liao	G10-2 Ian Huang	G10-2 Sean Wang
G11-2 Kaien Yeh	G11-2 Amber Huang	G11-2 Noreen Pan	G11-IB Annabelle Kuo
G11-2 Yume Chang	G11-1 Dora Yen	G11-2 Annabelle Chen	G11-2 Joyce Hua
G11-IB Rianne Ho	G11-1 Jenny Kwon	G10-2 Aaron Chen	G10-2 Ian Liao
G11-IB Sofia Schwaiger	G11-1 Catherine Chou	G11-2 Doris Tsai	G11-2 Nina Chang
G12-1 Adam Tsai	G12-1 Frank Tsai	G12-1 Doria Hsiao	G12-1 Joyce Yen
G12-1 Iris Yeh	G11-2 Edward Lin	G12-1 Jessica Chou	G11-2 Jim Hsu
G12-1 Jerry Li	G12-1 Branson Yu	G12-1 Nick Chen	G12-2 Hiroshi Chien
G12-1 Rafe Tseng	G12-2 Kenny Chew	G12-2 Lydia Chang	G12-2 Joanna Han
G12-1 Ryan Hsieh	G12-2 Stanley Chen	G12-1 Paul Hsieh	G12-2 Hank Li
G12-2 Andy Liu	G11-1 Tony Liu	G12-2 Henry Hoang	G12-2 Jeremy Chen
G12-2 Carien Yen	G11-1 Andy Chen	G11-1 Vincent Lee	G11-1 Hank Chang
G12-2 Joanna Chuang	G11-1 Brian Wang	G11-1 Roger Chew	G11-1 Gino Wang
G12-2 Joyce Wu	G11-2 Nick Poon	G11-1 Dustin James Hung Cruz	G11-2 Enzo Lee
G12-2 Linda Yang	G12-2 Jordan Chang	G11-1 Ryger Cheung	G11-2 Nestor Chiu
G12-2 Masa Chen	G12-2 Olivia Chang	G12-1 Max Wang	G12-1 Pinky Chang
G12-2 Tiffany Chu	G12-1 Jun Wu	G12-2 Michelle Chen	G12-1 Kumiko Murayama
G12-2 Wilson Lin	G7-1 Caelyn Ma	G12-1 Nathan Yu	G12-1 Ethan Ku
G7-1 Ema Lee	G7-2 Enway Chang	G9 Hailey Chloe Tomczak	G7-1 Rihanna Yang
G7-1 Eric Meng	G7-2 Isaac Chen	G7-2 Stanley Wang	G7-1 Ray Huang
G7-1 Luke Tang	G7-2 Ray Chen	G8-1 William Hsian	G7-1 Hubert Yang
G7-1 Nicky Tang	G7-1 Felicia Chi	G7-2 Albert Lee	G7-1 Ray Liu
G7-1 Sunny Liu	G7-2 Gloria Chuang	G7-1 Yumi Liao	G7-1 Sophie Lai
G7-2 Joliny Chung	G7-1 George Cheng	G7-2 Ariel Yang	G7-2 Abbey Chen
G7-2 Luka Fritz	G7-1 Ethan Tsai	G7-1 Ryder Yu	G7-2 Aven Tung
G7-2 Max Che	G7-2 Amber Shih	G7-1 Jeremy Chuang	G7-2 Eric Tseng
G7-2 Miami Chi	G7-1 Howard Su	G7-2 Victoria Liu	G7-2 Emma Liu
G7-2 Ray Lin	G7-1 Ethan Chu	G7-1 Rex Huang	G7-2 Wayne Chung
G7-2 Shane Wu	G7-2 Elsa Lou	G7-1 J Yen	G8-2 Maya Hsiao
G7-2 Sophia Lee	G8-2 Ethan Chang	G7-2 Emily Yang	G8-1 Angelina Liu
G8-1 Allen Hsu	G8-1 Ann Lin	G8-2 Melvis Lau	G8-1 Emma Chi
G8-1 Evelyn Chao	G8-1 Iyanne Hung	G8-1 Kristian Chen	G8-1 Isaac Yang
G8-1 Marni Ong	G8-2 Star Hung	G8-1 Audrey Huang	G8-2 Roy Chiu
G8-1 Ray Chang	G7-1 Melvin Lin	G8-1 Angus Wang	G8-2 Amy Tsai
G8-1 Yvonne Kuo	G8-2 Allen Chang	G8-2 Arthur Ho	G8-2 Malin Hsiao
G8-2 Arad Yen	G8-1 Angela Lin	G8-2 Olivia Yang	G8-1 Justin Kuo
G8-2 Mandy Tse	G8-2 Melody Chou	G8-2 Hana Fan	G8-1 Sophie Wang
G8-2 Ning Huang	G8-1 Arwin Chang	G8-1 Eric Kuo	G8-2 Yuan Liu
G8-2 Yann Lu	G8-1 Lucy Chien	G8-1 Isis Chiang	G9 Bernice Lu
G8-2 Zofia Wszola	G9 Erin Tsai	G9 Zara Ｗang	G9 Renna Lo
G9 Amber Hsieh	G9 Valkyrie Chang	G9 Ben Tsai	G9 Emma Huang
G9 Ariel Wu	G10-1 Bella Hsieh	G9 Sonya Lu	G8-2 William Chao
G9 Benjamin Hsu	G9 Shawn Yang	G8-2 Andy Ma	G9 Sophie Tsai
G9 Edward Chou	G9 Chloe Lin	G9 Ronni Ong	G9 Wendy Lee
G9 Iris Lin	G9 Mia Chen	G9 Jessica Hsiao	G12-2 Henry Lai
G9 Janet Lin	G9 Maika Fritz	G12-1 Edward Hsu	G12-1 Brady Liang
G9 Joy Chuang	G9 Andy Li	G12-1 Travis Ho	
G9 Tim Lin`;

function parseData(input: string) {
	const lines = input.trim().split('\n');
	const headers = lines[0].split('\t');
	const columns = headers.length;

	const assignments: { englishName: string; house: string }[] = [];

	for (let i = 1; i < lines.length; i++) {
		const cells = lines[i].split('\t');
		for (let j = 0; j < columns; j++) {
			const entry = cells[j]?.trim();
			if (!entry) continue;
			const parts = entry.split(' ');
			const englishName = parts.slice(1).join(' ');
			assignments.push({ englishName, house: headers[j] });
		}
	}

	return assignments;
}

const assignments = parseData(raw);
console.log(`Parsed ${assignments.length} assignments`);

const result = await convex.mutation(api.students.bulkAssignHouses, {
	assignments
});

console.log(`Result: ${JSON.stringify(result)}`);
