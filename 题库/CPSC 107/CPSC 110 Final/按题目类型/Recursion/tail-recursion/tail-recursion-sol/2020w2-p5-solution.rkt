;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p5-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment f-p5)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)

(@problem 1) ;This is actually problem 5, DO NOT EDIT OR DELETE THIS LINE!

;; PROBLEM
;;
;; Consider the following data definition.

(@htdd Node)
(define-struct node (name num nexts))
;; Node is (make-node String Natural (listof String))
;; A node in a graph that has:
;;  - the name of the node (these are unique in any given graph)
;;  - a number for the node (these may be duplicated in a given graph)
;;  - a list of the names of the node this node has an arrow pointing TO
;; INVARIANT: No node in any graph will have a number less than 1. In
;;            other words, no node will have number 0.
;;
(define (fn-for-graph start-node-name)
  ;; Termination argument:
  ;;
  (local [(define (fn-for-node n)
            (... (node-name n)
                 (node-num n)
                 (fn-for-los (node-nexts n))))
          
          (define (fn-for-los los)
            (cond [(empty? los) (...)]
                  [else
                   (... (fn-for-string (first los))
                        (fn-for-los (rest los)))]))

          (define (fn-for-string s)
            (... (fn-for-node (lookup-node s))))]
    
    (fn-for-string start-node-name)))


(@htdf find-increasing-path)
(@signature String String -> (listof String) or false)
;; path from start to to in which numbers strictly increase
(check-expect (find-increasing-path "A" "C") (list "A" "B" "C"))
(check-expect (find-increasing-path "D" "I") false)
(check-expect (find-increasing-path "A" "I") (list "A" "H" "I"))
(check-expect (find-increasing-path "D" "G") (list "D" "E" "F" "G"))

(@template-origin Node (listof String) String genrec accumulator try-catch)
#;
;; SR solution
(define (find-increasing-path start to) 
  (local [;; Termination argument:
          ;;   trivial case: reach a node already on path
          ;;   reduction: next nodes of current node
          ;;   argument: graph is finite, so detecting cycles with path
          ;;             will ensure that we eventually visit entire graph
          ;;
          ;; path is (listof String); names of nodes on this path in the graph
          ;; prev is Natural; number of immediately prior node on this path
          (define (find/node n path prev)
            (cond;[(member (node-name n) path) false]  ;cycle                
                  [(<= (node-num n) prev)       false] ;number must increase
                  ;;                                   ;also prevents cycles
                  [(string=? (node-name n) to)
                   (reverse (cons (node-name n) path))]
                  [else
                   (find/loname (node-nexts n)
                                (cons (node-name n) path)
                                (node-num n))]))
          
          (define (find/loname lon path prev)
            (cond [(empty? lon) false]
                  [else
                   (local [(define try (find/name  (first lon) path prev))]
                     (if (not (false? try))
                         try
                         (find/loname (rest lon) path prev)))]))
          
          (define (find/name n path prev)
            (find/node (lookup-node n) path prev))]

    (find/name start empty 0)))


(@template-origin encapsulated Node (listof String) String)
(define (find-increasing-path start to)
  ;; Termination argument:
  ;; trivial cases: reach a node already on path
  ;; reduction: next nodes of current node
  ;; argument: graph is finite, so detecting cycles with path will ensure that
  ;; we eventually visit entire graph
  ;; 
  ;; n-wl is (listof Node): unvisited direct next nodes of the visited nodes
  ;; path-wl is (listof (listof String)): path tandem worklist
  ;; prev-wl is (listof Natural): previous node's number tandem worklist
  ;;
  ;; n-wl, path-wl and prev-wl always have same length, the elements of
  ;; the 3 work lists correspond with each other - the nth element of
  ;; path-wl is the path to reach the nth element of n-wl, the nth
  ;; element in prev-wl is the number of node that occurs before the
  ;; nth element in n-wl 
  
  (local [(define (find/node n path prev n-wl path-wl prev-wl)
            (cond [(<= (node-num n) prev) (find/loname n-wl path-wl prev-wl)]
                  [(string=? (node-name n) to)
                   (reverse (cons (node-name n) path))]
                  [else
                   (find/loname (append (node-nexts n)
                                        n-wl)
                                (append (make-list (length (node-nexts n))
                                                   (cons (node-name n) path))
                                        path-wl)
                                (append (make-list (length (node-nexts n))
                                                   (node-num n))
                                        prev-wl))]))
          
          (define (find/loname n-wl path-wl prev-wl)
            (cond [(empty? n-wl) false]
                  [else
                   (find/name (first n-wl) (first path-wl) (first prev-wl)
                              (rest n-wl)  (rest path-wl)  (rest prev-wl))]))

          (define (find/name s path prev n-wl path-wl prev-wl)
            (find/node (lookup-node s) path prev n-wl path-wl prev-wl))]
    
    (find/name start empty 0 empty empty empty)))




;; YOU DO NOT NEED TO READ PAST HERE, AND YOU MUST NOT MAKE ANY EDITS PAST HERE.
              
(define (lookup-node name)
  (local [(define (scan lst)
            (cond [(empty? lst) (error "Unknown node name " name)]
                  [else
                   (if (string=? (node-name (first lst)) name)
                       (first lst)
                       (scan (rest lst)))]))]
    (scan (list (make-node "A" 1 (list "D" "H" "B"))
                (make-node "B" 2 (list "A" "C"))
                (make-node "C" 3 (list "H"))
                (make-node "D" 3 (list "E" "H"))
                (make-node "E" 4 (list "F"))
                (make-node "F" 5 (list "D" "G"))
                (make-node "G" 6 (list ))
                (make-node "H" 2 (list "F" "I"))
                (make-node "I" 5 (list ))))))
