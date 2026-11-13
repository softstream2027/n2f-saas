import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";
import { PLAN_KEYS } from "../config";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
const toBool = ({ value }: { value: unknown }) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1";
  return Boolean(value);
};

export class RegisterDto {
  @Transform(trim)
  @IsOptional()
  @IsString({ message: "Le nom de la société doit être une chaîne de caractères." })
  @Length(2, 150, { message: "Le nom de la société doit contenir entre 2 et 150 caractères." })
  companyName?: string;

  /** Matricule fiscal / UID / n° TVA */
  @Transform(trim)
  @IsString({ message: "Le matricule fiscal doit être une chaîne de caractères." })
  @Length(3, 30, { message: "Le matricule fiscal doit contenir entre 3 et 30 caractères." })
  taxId: string;

  @Transform(trim)
  @IsOptional()
  @IsString({ message: "Le pays doit être une chaîne de caractères." })
  @Length(2, 2, { message: "Le pays doit contenir exactement 2 caractères." })
  country?: string;

  @Transform(toBool)
  @IsOptional()
  simpleUser?: boolean;

  @Transform(trim)
  @IsEmail({}, { message: "L'e-mail professionnel est invalide." })
  @MaxLength(180, { message: "L'e-mail professionnel ne doit pas dépasser 180 caractères." })
  email: string;

  @Transform(trim)
  @Matches(/^[A-Za-z0-9._-]{4,40}$/, { message: "Le login doit contenir entre 4 et 40 caractères (lettres, chiffres, . _ -)." })
  login: string;

  // Le champ password n'est plus requis : le mot de passe est généré par Axelor et envoyé par e-mail.
  @IsIn(PLAN_KEYS as unknown as string[], { message: "Le plan sélectionné est invalide." })
  plan: string;
}

export class ConfirmDto {
  @IsString({ message: "L'identifiant de souscription est invalide." })
  @Length(5, 100, { message: "L'identifiant de souscription doit contenir entre 5 et 100 caractères." })
  subscriptionId: string;
}