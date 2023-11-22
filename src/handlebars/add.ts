
export default function(num1: number, num2: number): number {
  return typeof num1 === 'number' && typeof num2 === 'number' ? 
    num1 + num2 :
    num1;
}