import java.util.Scanner;
public class New{
    public static void main(String[] args){
        Scanner obj = new Scanner(System.in);
 
        int[] car = new int[7];
        for(int i = 0;i<car.length; i++){
            System.out.println("Enter any number");
            car[i] = obj.nextInt();

        }

    }
}