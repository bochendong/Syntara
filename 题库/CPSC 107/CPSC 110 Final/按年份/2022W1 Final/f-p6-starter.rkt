;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.

(require spd/tags)

(@assignment exams/2022w1-f/f-p6);Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line
(@problem 6) ;do not edit or delete this line


;; Data definitions:

(@htdd Package)
(define-struct pkg (size gifts))
;; Slot is (make-pkg Natural (listof Gift))
;; interp. a package to go on the sleigh, with its:
;;           - size measured in sugarplums
;;           - a list of all the gifts it contains
(define P5 (make-pkg 5 empty))
(define P8 (make-pkg 8 empty))

(define P1 (make-pkg 1 empty))
(define P2 (make-pkg 2 empty))
(define P3 (make-pkg 3 empty))
(define P4 (make-pkg 4 empty))
(define P6 (make-pkg 6 empty))
(define P7 (make-pkg 7 empty))


(@htdd Gift)
(define-struct gift (size for))
;; Gift is (make-gift Integer String)
;; interp. A gift, with it's size in sugarplums and
;;         the name of the person it is for.
(define G3X (make-gift 3 "X"))
(define G4Y (make-gift 4 "Y"))
(define G2Z (make-gift 2 "Z"))

(define G1 (make-gift 1 "Ely"))
(define G2 (make-gift 1 "Bernie"))
(define G3 (make-gift 2 "Gautie"))
(define G4 (make-gift 2 "JB"))
(define G5 (make-gift 3 "BillG"))
(define G6 (make-gift 3 "Warr"))

(@htdd SearchState)
(define-struct ss (packages unpacked-gifts))
;; SearchState is (make-ss (listof Package) (listof Gift))
;; interp. The changing information at one point in the search tree.
;;         packages is all the original supplied packages, except
;;         that some of them may have had gifts added to them.
;;         unpacked-gifts is the gifts that still remain to be packed.


(@htdf solve)
(@signature (listof Package) (listof Gift) -> (listof Package) or false)
;; produce packages containing all the supplied gifts, or fail
(check-expect (solve empty empty) empty) 
(check-expect (solve (list P1 P2 P3) empty) (list P1 P2 P3))
(check-expect (solve empty (list G1)) false)
(check-expect (solve (list P1) (list G1))
              (list (make-pkg 1 (list G1))))
(check-expect (solve (list P1) (list G1 G2)) false)
(check-expect (solve (list P1 P3) (list G1 G2 G3 G4)) false)
(check-expect (solve (list P1 P2 P3 P4) (list G4 G3 G2 G1))
              (list (make-pkg 1 (list (make-gift 1 "Ely")))
                    (make-pkg 3
                              (list (make-gift 1 "Bernie")
                                    (make-gift 2 "Gautie")))
                    (make-pkg 2 (list (make-gift 2 "JB")))
                    (make-pkg 4 empty)))


(@template-origin genrec arb-tree try-catch encapsulated)

(define (solve lop log)
  (local [;;
          ;; trivial case:
          ;;  all gifts have been packed,
          ;;  or no package exists with room in it for first gift
          ;; reduction step:
          ;;  make one new ss for each package that has room for
          ;;  the first remaining gift
          ;; argument:
          ;;  there's a finite number of packages and gifts, at
          ;;  each step the number of gifts remaining to pack is
          ;;  reduced by one
          (define (search/one ss)
            (cond [(succeeded? ss) (ss-packages ss)]
                  [else
                   (search/list (next-search-states ss))]))
          
          (define (search/list loss)
            (cond [(empty? loss) false]
                  [else
                   (local [(define try (search/one (first loss)))]
                     (if (not (false? try))
                         try
                         (search/list (rest loss))))]))]
    
    (search/one (make-ss lop log))))



(@htdf succeeded?)
(@signature SearchState -> Boolean)
;; produce true if there are no more unpacked gifts
(check-expect (succeeded? (make-ss (list)     (list G1 G2))) false)
(check-expect (succeeded? (make-ss (list P1)  (list G1 G2))) false)
(check-expect (succeeded? (make-ss (list P2)  (list)))       true)
(check-expect (succeeded? (make-ss (list)     (list)))       true)

(@template-origin SearchState)
              
(define (succeeded? ss)
  (empty? (ss-unpacked-gifts ss)))


(@htdf next-search-states)
(@signature SearchState -> (listof SearchState))
;; produce one next search state for each package that has room for first gift

(check-expect (next-search-states
               (make-ss (list (make-pkg 5 (list))
                              (make-pkg 8 (list)))
                        (list G3X G4Y G2Z)))
              (list
               (make-ss (list (make-pkg 5 (list G3X))
                              (make-pkg 8 (list)))
                        (list G4Y G2Z))
               (make-ss (list (make-pkg 8 (list G3X))
                              (make-pkg 5 (list)))
                        (list G4Y G2Z))))

(check-expect (next-search-states
               (make-ss (list (make-pkg 5 (list G3X))
                              (make-pkg 8 (list)))
                        (list G4Y G2Z)))
              (list
               (make-ss (list (make-pkg 8 (list G4Y))
                              (make-pkg 5 (list G3X)))
                        (list G2Z))))

(check-expect (next-search-states
               (make-ss (list (make-pkg 8 (list G3X))
                              (make-pkg 5 (list)))
                        (list G4Y G2Z)))
              (list
               (make-ss (list (make-pkg 8 (list G4Y G3X))
                              (make-pkg 5 (list)))
                        (list G2Z))
               (make-ss (list (make-pkg 5 (list G4Y))
                              (make-pkg 8 (list G3X)))
                        (list G2Z))))

(define (next-search-states ss)
  (local [(define pkgs  (ss-packages ss))
          (define gifts (ss-unpacked-gifts ss))
          (define gift (first gifts))
          (define package-has-room
            (filter (lambda (p) (has-room-for? p gift)) pkgs))
          ]
    
   #|
    package 4 (), package 8 ()    | (3X, 4Y, 3Z)
        package 4 (3X), package 8 ()    | (4Y, 3Z)
            package 4 (3X), package 8 (4Y)    | (3Z)
                package 4 (3X), package 8 (4Y, 3Z)    | (empty)

        package 4 (), package 8 (3X)    | (4Y, 3Z)
            package 4 (4Y), package 8 (3X)    | (3Z)
                package 4 (4Y), package 8 (3X 3Z)    | (empty)
            package 4 (), package 8 (3X, 4Y)    | (3Z)
                package 4 (3Z), package 8 (3X, 4Y)    | (empty)


    package 4 (), package 8 ()    | (3X, 4Y, 3Z)

     (list package 4 (3X), package 8 ()    | (4Y, 3Z)
            package 4 (), package 8 (3X)    | (4Y, 3Z))
    
    pkgs:             (list package 4 (), package 8 ())
    package-has-room: (list package 4 (), package 8 ())
    gifts:            (3X, 4Y, 3Z)
    gift:             3X

    package 4 (3X), package 8 ()
    |#
    
    
    (map (lambda (x)
           (make-ss (cons
                     (make-pkg (pkg-size x) (cons gift (pkg-gifts x)))
                     (remove x pkgs))
                    
                    (remove gift gifts)))
         package-has-room)))



;; The following helper function should be useful for you.

(@signature Package Gift -> Boolean)
;; produce true if total of existing gifts in package leaves room to add gift
(check-expect (has-room-for? P5 (make-gift 4 "X")) true)
(check-expect (has-room-for? P6 (make-gift 6 "X")) true)
(check-expect (has-room-for? P7 (make-gift 8 "X")) false)
(check-expect (has-room-for? (make-pkg 7 (list G3 G5)) G1) true)
(check-expect (has-room-for? (make-pkg 7 (list G3 G5)) G4) true)
(check-expect (has-room-for? (make-pkg 6 (list G3 G6)) G4) false)

(define (has-room-for? p g)
  (<= (+ (foldl + 0 (map gift-size (pkg-gifts p)))
         (gift-size g))
      (pkg-size p)))
